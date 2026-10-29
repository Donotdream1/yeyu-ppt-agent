"""Private Hermes runtime. Structured tools use a JSON-lines pipe to the app."""
import contextlib
import functools
import json
import os
from pathlib import Path
import sys
import threading
from urllib.parse import urlparse
import uuid

PROTOCOL_OUT = sys.stdout
LOCK = threading.Lock()
VISION_REPORTER = None

def emit(value):
    PROTOCOL_OUT.write(json.dumps(value, ensure_ascii=False) + '\n')
    PROTOCOL_OUT.flush()

def rpc(name, arguments):
    with LOCK:
        # The parent may terminate a completed stage immediately after this RPC.
        # Send transport evidence before the tool, not only after conversation end.
        if VISION_REPORTER is not None:
            VISION_REPORTER()
        call_id = uuid.uuid4().hex
        emit({'type': 'tool', 'id': call_id, 'name': name, 'arguments': arguments})
        response = json.loads(sys.stdin.readline())
        if response.get('id') != call_id:
            raise RuntimeError('PPT tool response mismatch')
        return json.dumps(response.get('result', {}), ensure_ascii=False)


def count_image_parts(messages):
    if not isinstance(messages, list):
        return 0
    return sum(
        1 for message in messages if isinstance(message, dict)
        for part in (message.get('content') if isinstance(message.get('content'), list) else [])
        if isinstance(part, dict) and part.get('type') in {'image_url', 'input_image', 'image'}
    )


class NativeVisionObserver:
    """Observe this agent's real DeepSeek SDK payload, without logging image bytes.

    Hermes can retry an image rejection as text while leaving images in canonical
    history. Only accepted SDK calls plus the rejection state are evidence that
    this turn actually used native image input.
    """
    def __init__(self, agent, requested, attached, base_url='https://api.deepseek.com'):
        self.agent = agent
        self.expected_endpoint = urlparse(base_url)
        self.requested = requested
        self.attached = attached
        self.image_requests = 0
        self.accepted_requests = 0
        self.accepted_images = 0
        self.last_images = 0
        self.stripped = False
        self.rejection = None
        self.lock = threading.RLock()

    def snapshot(self):
        with self.lock:
            rejected = bool(getattr(self.agent, '_image_rejecting_models', set()))
            accepted = (self.attached > 0 and self.accepted_requests > 0
                        and not self.stripped and not self.rejection and not rejected)
            reason = (self.rejection or ('model_rejected_images' if rejected else None)
                      or ('images_removed_from_outbound_request' if self.stripped else None)
                      or ('native_images_accepted' if accepted else 'native_images_not_yet_accepted'))
            return {'nativeVision': accepted,
                    'mode': 'image-understanding' if accepted else 'geometry-only',
                    'reason': reason, 'requestedImages': self.requested,
                    'attachedImages': self.attached, 'outboundImageRequests': self.image_requests,
                    'acceptedImageRequests': self.accepted_requests,
                    'acceptedImages': self.accepted_images, 'lastRequestImageCount': self.last_images,
                    'imagesStripped': self.stripped, 'modelRejectedImages': rejected}

    def report(self):
        emit({'type': 'vision_status', **self.snapshot()})

    def install(self):
        # With provider='custom', Hermes may not find the official model's
        # capability metadata and otherwise call an auxiliary vision backend to
        # replace pixels with prose. This role must send pixels directly to the
        # user-selected DeepSeek endpoint; the observer below verifies acceptance.
        self.agent._prepare_messages_for_non_vision_model = lambda messages: messages
        self.agent._prepare_anthropic_messages_for_api = lambda messages: messages
        original_factory = self.agent._create_request_openai_client
        observer = self

        @functools.wraps(original_factory)
        def observed_factory(*args, **kwargs):
            client = original_factory(*args, **kwargs)
            if (urlparse(str(client.base_url)).scheme, urlparse(str(client.base_url)).netloc) != (observer.expected_endpoint.scheme, observer.expected_endpoint.netloc):
                raise RuntimeError('原生视觉接口与用户配置的模型连接不一致')
            completions = client.chat.completions
            if getattr(completions, '_ppt_native_vision_observer', False):
                return client
            original_create = completions.create

            @functools.wraps(original_create)
            def observed_create(*create_args, **create_kwargs):
                # Hermes's SDK-transform bypass moves the actual wire messages
                # into extra_body and leaves messages=[] as a typed placeholder.
                extra = create_kwargs.get('extra_body')
                payload = extra.get('messages') if isinstance(extra, dict) and 'messages' in extra else create_kwargs.get('messages')
                image_count = count_image_parts(payload)
                with observer.lock:
                    observer.last_images = image_count
                    if image_count:
                        observer.image_requests += 1
                    elif observer.attached:
                        observer.stripped = True
                try:
                    result = original_create(*create_args, **create_kwargs)
                except Exception as exc:
                    from agent.message_sanitization import (
                        _looks_like_image_content_rejection,
                        _looks_like_corrupt_image_rejection,
                    )
                    body = str(getattr(exc, 'body', None) or exc)
                    with observer.lock:
                        if image_count and _looks_like_image_content_rejection(body):
                            observer.rejection = 'provider_rejected_image_input'
                        elif image_count and _looks_like_corrupt_image_rejection(body):
                            observer.rejection = 'provider_rejected_image_payload'
                    observer.report()
                    raise
                with observer.lock:
                    if image_count:
                        observer.accepted_requests += 1
                        observer.accepted_images += image_count
                observer.report()
                return result

            completions.create = observed_create
            completions._ppt_native_vision_observer = True
            return client

        self.agent._create_request_openai_client = observed_factory

def main():
    global VISION_REPORTER
    request = json.loads(sys.stdin.readline())
    source = Path(request['sourcePath']).resolve()
    missing = [name for name in ('hermes_bootstrap.py', 'run_agent.py', 'tools/registry.py', 'tools/skills_tool.py') if not (source / name).is_file()]
    if missing:
        raise RuntimeError('Hermes 源码目录不完整，缺少 ' + '、'.join(missing) + '。请检查 HERMES_SOURCE_PATH 是否指向仓库根目录。')
    sys.path.insert(0, str(source))
    os.environ['HERMES_HOME'] = request['hermesHome']
    os.environ['HERMES_SKIP_BACKGROUND_REVIEW'] = '1'
    with contextlib.redirect_stdout(sys.stderr):
        import hermes_bootstrap
        from run_agent import AIAgent
        from tools.registry import registry
        from tools.skills_tool import skill_view
        def view_skill(args, **kwargs):
            content = skill_view(args['name'], file_path=args.get('file_path'))
            if json.loads(content).get('success'):
                rpc('skill_loaded', {'name': args['name'], 'file_path': args.get('file_path')})
            return content
        if request.get('allowSkillTool', True):
            registry.register(name='ppt_skill_view', toolset='ppt_workflow', schema={'name':'ppt_skill_view','description':'Load the full project skill or its linked references before that stage. Available: ppt-writing, chart-drawing, material-use, layout-review, harness-review, presentation-style, template-design.','parameters':{'type':'object','properties':{'name':{'type':'string'},'file_path':{'type':'string'}},'required':['name']}}, handler=view_skill)
        for schema in request['tools']:
            def handler(args, _name=schema['name'], **kwargs):
                return rpc(_name, args)
            registry.register(name=schema['name'], toolset='ppt_workflow', schema=schema, handler=handler)
        if request.get('probe'):
            emit({'type':'ready','runtime':'Hermes AIAgent','source':request['sourcePath'],'tools':registry.get_tool_names_for_toolset('ppt_workflow')})
            return
        agent = AIAgent(
            model=request.get('model', 'deepseek-flash'), api_key=request['apiKey'],
            base_url=request.get('baseUrl', 'https://api.deepseek.com'), provider='custom', api_mode='chat_completions',
            enabled_toolsets=['ppt_workflow'], max_iterations=request.get('maxIterations', 45), max_tokens=request.get('maxTokens', 26000),
            quiet_mode=True, save_trajectories=False, skip_context_files=True,
            skip_memory=True, skip_background_review=True, load_soul_identity=False,
            ephemeral_system_prompt=request['systemPrompt'], cwd=request['workspace'],
            request_overrides=({'extra_body': {'thinking': {'type':'disabled'}}} if urlparse(request.get('baseUrl', 'https://api.deepseek.com')).hostname == 'api.deepseek.com' else {}),
        )
        user_message = request['message']
        image_paths = request.get('images') or []
        vision = None
        if image_paths:
            if not isinstance(image_paths, list) or any(
                not isinstance(item, str) or not Path(item).is_absolute()
                for item in image_paths
            ):
                emit({'type': 'vision_status', 'nativeVision': False,
                      'mode': 'geometry-only', 'reason': 'invalid_local_image_paths'})
                raise ValueError('视觉输入必须是本地绝对路径数组')
            from agent.image_routing import build_native_content_parts
            user_message, skipped = build_native_content_parts(user_message, image_paths)
            attached = count_image_parts([{'role': 'user', 'content': user_message}])
            if skipped or attached != len(image_paths):
                emit({'type': 'vision_status', 'nativeVision': False,
                      'mode': 'geometry-only', 'reason': 'image_attachment_failed',
                      'requestedImages': len(image_paths), 'attachedImages': attached})
                raise ValueError('部分视觉图像不可读取，未启动图像理解')
            vision = NativeVisionObserver(agent, len(image_paths), attached, request.get('baseUrl', 'https://api.deepseek.com'))
            vision.install()
            VISION_REPORTER = vision.report
        result = agent.run_conversation(user_message)
        complete = {'type':'complete','final':result.get('final_response','')}
        if vision is not None:
            vision.report()
            complete['vision'] = vision.snapshot()
        emit(complete)

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        emit({'type':'error','error':str(exc)[:800]})
        sys.exit(1)
