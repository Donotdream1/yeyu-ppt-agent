import { useEffect, useRef, useState } from "react";
import { api, post } from "../lib/api.js";
import {readWorkspaceLocation} from '../lib/routes';
import {useAuth} from '../components/AuthGate';
import {accountStorage} from '../lib/account-storage';

export function useStudio() {
  const useAuthUser=useAuth()?.user||{},accountStore=accountStorage(useAuthUser),canViewLibrary=useAuthUser.role==='owner';
  const [tab, setTab] = useState(() =>{const route=readWorkspaceLocation(window.location),pref=useAuthUser.preferences?.personalization?.startPage;if(location.pathname==='/'&&!new URLSearchParams(location.search).has('tab')&&!route.outputId&&!route.publicId&&!route.jobId&&['create','history','projects','styles'].includes(pref))return pref;return route.tab==='library'&&!canViewLibrary?'create':route.tab;}),
    [studio, setStudio] = useState({
      templates: [],
      sources: [],
      componentCount: 0,
      chartPrompt: "",
    }),
    [templateId, setTemplateId] = useState(""),
    [document, setDocument] = useState(""),
    [docName, setDocName] = useState(""),
    [title, setTitle] = useState(""),
    [requirements, setRequirements] = useState(""),
    [chartRequest, setChartRequest] = useState(""),
    [audience, setAudience] = useState("管理层"),
    [pageCount, setPageCount] = useState(0),
    [layoutDensity, setLayoutDensity] = useState(useAuthUser.preferences?.presentation?.layoutDensity || "full"),
    [inputMode,setInputMode]=useState("document"),
    [mode, setMode] = useState("deepseek"),
    [apiKey, setApiKey] = useState(""),
    [model, setModel] = useState("deepseek-flash"),
    [dataFiles, setDataFiles] = useState([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [settings, setSettings] = useState(false),
    [jobId, setJobId] = useState(""),
    [output, setOutput] = useState(null),
    [plan, setPlan] = useState(null),
    [page, setPage] = useState(0),
    [editing, setEditing] = useState(false),
    [selectedBlock, setSelectedBlock] = useState(""),
    [catalog, setCatalog] = useState({ items: [], total: 0, pages: 0 }),
    [q, setQ] = useState(""),
    [type, setType] = useState("all"),
    [sourceFilter, setSourceFilter] = useState(""),
    [catalogPage, setCatalogPage] = useState(1),
    [detail, setDetail] = useState(null),
    [picker, setPicker] = useState(false),
    [folder, setFolder] = useState("E:\\BaiduNetdiskDownload"),
    [templatePath, setTemplatePath] = useState(""),
    [chartPrompt, setChartPrompt] = useState(""),
    [prompt, setPrompt] = useState(
      "保留原文事实与数字，文字简洁，依据内容逻辑选用合适的图标、流程图和图表。",
    );
  const docInput = useRef(),
    dataInput = useRef(),
    templateInput = useRef(),
    materialInput = useRef(),
    referenceInput = useRef();
  const [docHash, setDocHash] = useState("");
  const [styleSkillId,setStyleSkillId]=useState(()=>accountStore.getItem('yeyu-style-skill')||'native-material');
  useEffect(()=>accountStore.setItem('yeyu-style-skill',styleSkillId),[styleSkillId]);
  const [workspaceFolderId,setWorkspaceFolderId]=useState(()=>accountStore.getItem('yeyu-folder')||null);
  const [workspaceFolderName,setWorkspaceFolderName]=useState(()=>accountStore.getItem('yeyu-folder-name')||'');
  useEffect(()=>{if(workspaceFolderId){accountStore.setItem('yeyu-folder',workspaceFolderId);accountStore.setItem('yeyu-folder-name',workspaceFolderName);}else{accountStore.removeItem('yeyu-folder');accountStore.removeItem('yeyu-folder-name');}},[workspaceFolderId,workspaceFolderName]);
  function openProjectDraft(id,name){let draft={};try{draft=JSON.parse(accountStore.getItem('yeyu-project-'+id)||'{}');}catch{}setWorkspaceFolderId(id);setWorkspaceFolderName(name);setDocument(draft.document||'');setInputMode(draft.inputMode||'document');setDocName(draft.docName||'');setTitle(draft.title||'');setRequirements(draft.requirements||'');setDocHash(draft.docHash||'');setStyleSkillId(draft.styleSkillId||styleSkillId);}
  useEffect(()=>{if(workspaceFolderId)accountStore.setItem('yeyu-project-'+workspaceFolderId,JSON.stringify({document,inputMode,docName,title,requirements,docHash,styleSkillId}));},[workspaceFolderId,document,inputMode,docName,title,requirements,docHash,styleSkillId]);
  const [pageWorkBusy,setPageWorkBusy]=useState(false);
  const [photoTargetPreview,setPhotoTargetPreview]=useState(null);
  const [jobSnapshot, setJobSnapshot] = useState(null),
    [resuming, setResuming] = useState(false);
  const [designProfile, setDesignProfile] = useState("auto"),
    [paletteMode, setPaletteMode] = useState("material"),
    [paletteSourceId, setPaletteSourceId] = useState(""),
    [palettePreview, setPalettePreview] = useState(null),
    [designOptions, setDesignOptions] = useState({ sources: [] }),
    [userColors, setUserColors] = useState({
      primary: "164C78",
      bar: "1044A4",
      surface: "EDF2FC",
      border: "B8C0C6",
      text: "202020",
      accent: "B54A50",
    }),
    [institutionName, setInstitutionName] = useState(""),
    [outlineDraft, setOutlineDraft] = useState(null),
    [liveOutline, setLiveOutline] = useState(null);
  const [recommendations, setRecommendations] = useState({ items: [] }),
    [recommendLoading, setRecommendLoading] = useState(false),
    [recommendActive, setRecommendActive] = useState(false),
    [recommendScope, setRecommendScope] = useState("full"),
    [densityDraft, setDensityDraft] = useState("full"),
    [previousOutput, setPreviousOutput] = useState(null),
    [pickerMode, setPickerMode] = useState("add"),
    [scope, setScope] = useState("full"),
    [purpose, setPurpose] = useState("content"),
    [relation, setRelation] = useState("all"),
    [presentationPrompt, setPresentationPrompt] = useState("");
  const template = studio.templates.find((t) => t.id === templateId),
    planTemplate =
      studio.templates.find((t) => t.id === plan?.templateId) || template,
    slide = plan?.slides[page],
    block = slide?.blocks?.find((b) => b.id === selectedBlock);
  const heading = {
    create: ["自动生成", "文档成稿，设计由你挑选"],
    library: ["单页素材库", "按内容，找到合适的设计"],
    templates: ["用户模板", "每次创作，都用你的模板"],
    charts: ["图表规范", "先核对数据，再呈现结论"],
    skills: ["技能中心", "让专业技能，协同完成每一页"],
    rules: ["生成规则", "让每一页，都有清晰的表达"],
  }[tab];
  async function refresh() {
    const c = await api("/api/studio");
    setStudio(c);
    setChartPrompt(c.chartPrompt);
    setPresentationPrompt(c.presentationPrompt || "");
    setModel(c.model);
    setTemplateId((id) =>
      c.templates.some((t) => t.id === id) ? id : c.activeTemplateId,
    );
    return c;
  }
  useEffect(() => {
    api("/api/design-options")
      .then((d) => {
        setDesignOptions(d);
        setPaletteSourceId("");
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (paletteSourceId)
      api("/api/design-palette/" + paletteSourceId)
        .then(setPalettePreview)
        .catch(() => setPalettePreview(null));
  }, [paletteSourceId]);
  useEffect(() => {
    const route=readWorkspaceLocation(window.location);
    if (route.outputId||route.publicId)
      (route.publicId?api('/api/links/'+route.publicId).then(r=>r.outputId):Promise.resolve(route.outputId)).then(id=>api("/api/outputs/" + id))
        .then((o) => {
          setOutput(o);
          setPlan(o.plan);
          setPage(
            Math.max(
              0,
              Math.min(
                o.pages - 1,
                route.page,
              ),
            ),
          );
        })
        .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    try {
      const saved = JSON.parse(
          accountStore.getItem("shiye-auto-draft") || "null",
        ),
        old = JSON.parse(accountStore.getItem("shiye-draft") || "null");
      if (saved) {
        setDocument(saved.document || "");setInputMode(saved.inputMode||"document");
        setTitle(saved.title || "");
        setRequirements(saved.requirements || "");
        setChartRequest(saved.chartRequest || "");
        setAudience(saved.audience || "管理层");
        setPageCount(saved.pageCount || 0);
        setMode("deepseek");
      } else if (old) {
        setDocument(old.doc || "");
        setTitle(old.title || "");
        setRequirements(old.brief || "");
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      accountStore.setItem(
        "shiye-auto-draft",
        JSON.stringify({
          document,
          inputMode,
          title,
          requirements,
          chartRequest,
          audience,
          pageCount,
          mode,
        }),
      );
    } catch {}
  }, [document, inputMode,title, requirements, chartRequest, audience, pageCount, mode]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!canViewLibrary || tab !== "library" && !picker) return;
    let cancelled = false;
    const t = setTimeout(
      () =>
        api(
          `/api/components?q=${encodeURIComponent(q)}&type=${type}&source=${sourceFilter}&page=${catalogPage}&limit=48&scope=${scope}&purpose=${purpose}&relation=${relation}`,
        )
          .then((d) => {
            if (!cancelled) setCatalog(d);
          })
          .catch((e) => setError(e.message)),
      180,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    tab,
    picker,
    q,
    type,
    sourceFilter,
    catalogPage,
    studio.componentCount,
    scope,
    purpose,
    relation,
  ]);
  useEffect(() => {
    try {
      const route=readWorkspaceLocation(window.location);if(route.outputId||route.publicId)return;
      const saved =
        route.jobId ||
        accountStore.getItem("shiye-active-job");
      if (saved && /^[a-f0-9-]{36}$/.test(saved)) {
        setJobId(saved);
        setBusy("正在恢复任务进度");
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (!jobId) return;
    setJobSnapshot((previous) =>
      previous?.id === jobId
        ? { ...previous, status: "running" }
        : { id: jobId, status: "running", phase: "正在读取任务状态" },
    );
    let cancelled = false,
      timer,
      failures = 0;
    try {
      accountStore.setItem("shiye-active-job", jobId);
    } catch {}
    async function poll() {
      try {
        const j = await api("/api/jobs/" + jobId);
        if (cancelled) return;
        failures = 0;
        setJobSnapshot(j);
        setBusy(j.phase || "正在制作");
        if (j.plan) setLiveOutline(j.plan);
        if (j.status === "done") {
          try {
            accountStore.removeItem("shiye-active-job");
          } catch {}
          setJobId("");
          setBusy("");
          if (j.output.styleOnly) {
            setLiveOutline({
              slides: [],
              styleDecision: j.output.styleDecision,
            });
            setToast("已识别文档风格并选取素材配色");
            return;
          }
          if (j.output.planningOnly) {
            setOutlineDraft(j.output.plan);
            setLiveOutline(j.output.plan);
            setToast("逐页方案已生成，可查看后制作PPT");
            return;
          }
          setOutput({
            ...j.output,
            render: j.output.render || { status: "queued" },
          });
          setPlan(j.output.plan);
          setPage(j.kind === "replace" ? j.page : 0);
          setEditing(false);
          setToast(
            j.kind === "replace"
              ? "本页适配完成；完整性检查已通过，其他页面素材版本已固定"
              : `已自动完成 ${j.output.pages} 页内容、元素编排和模板套用`,
          );
          return;
        }
        if (j.status === "stopped") {setBusy("");setError("");setJobId("");return;}
        if (j.status === "failed") {
          setBusy("");
          setError(j.recovery?.status==='ready'&&j.resumable?'':j.error || "任务未完成，可查看已保存的进度");
          setJobId("");
          return;
        }
      } catch (e) {
        if (cancelled) return;
        failures++;
        if (failures >= 3) {
          setError(
            "暂时无法读取任务状态：" +
              e.message +
              "。刷新页面后将尝试恢复任务。",
          );
          setBusy("");
          setJobId("");
          return;
        }
      }
      if (!cancelled) timer = setTimeout(poll, failures ? 3500 : 1800);
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId]);
  useEffect(() => {
    if (!output) return;
    let cancelled = false;
    const t = setInterval(
      () =>
        api("/api/outputs/" + output.id)
          .then((d) => {
            if (!cancelled) {
              setOutput(d);
              if (!["queued", "rendering"].includes(d.render?.status))
                clearInterval(t);
            }
          })
          .catch(() => clearInterval(t)),
      2200,
    );
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [output?.id]);
  const recommendationCache=useRef(new Map()),recommendationRequest=useRef(null);
  const recommendationKey=[output?.id,page,slide?.materialId,recommendScope].join(':');
  async function refreshRecommendations({refresh=true,reset=false}={}){
    if(!slide||!plan||recommendationRequest.current)return;
    const key=recommendationKey,entry=recommendationCache.current.get(key)||{seen:[]};
    if(!refresh&&entry.result){setRecommendations(entry.result);return;}
    const controller=new AbortController();recommendationRequest.current=controller;setRecommendLoading(true);
    try{
      const result=await api('/api/material-recommendations',{method:'POST',signal:controller.signal,body:JSON.stringify({ai:true,slide,referenceId:plan.referenceId,materialScope:recommendScope,templateId:plan.templateId,apiKey,model,excludeIds:reset?[]:entry.seen,usedMaterialIds:plan.slides.map(s=>s.materialId).filter(Boolean)})});
      if(controller.signal.aborted)return;
      const next={seen:[...new Set([...(reset?[]:entry.seen),...result.items.map(i=>i.id)])].slice(-2000),result};
      recommendationCache.current.set(key,next);if(recommendationCache.current.size>40)recommendationCache.current.delete(recommendationCache.current.keys().next().value);
      setRecommendations(result);
    }catch(e){if(!controller.signal.aborted)setRecommendations({...entry.result,items:entry.result?.items||[],note:e.message,error:true});}
    finally{if(recommendationRequest.current===controller){recommendationRequest.current=null;setRecommendLoading(false);}}
  }
  useEffect(()=>{recommendationRequest.current?.abort();recommendationRequest.current=null;setRecommendLoading(false);setRecommendations(recommendationCache.current.get(recommendationKey)?.result||{items:[]});return()=>{recommendationRequest.current?.abort();recommendationRequest.current=null;};},[recommendationKey]);
  useEffect(()=>{if(recommendActive)void refreshRecommendations({refresh:false});},[recommendationKey,recommendActive]);
  useEffect(() => {
    setDensityDraft(slide?.layoutDensity || plan?.layoutDensity || "full");
  }, [page, output?.id]);
  async function run(label, fn) {
    setError("");
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  function uploadDoc(file,projectId=workspaceFolderId) {
    if (!file) return;
    run("正在读取文档", async () => {
      const f = new FormData();
      f.append("file", file);if(projectId)f.append("workspaceFolderId",projectId);
      const d = await api("/api/documents", { method: "POST", body: f });
      setDocument(d.text);setInputMode('document');
      setDocName(d.name);
      setDocHash(d.sha256 || "");
      setToast(`已读取 ${d.characters.toLocaleString()} 字`);
    });
  }
  function uploadData(file) {
    if (!file) return;
    run("正在识别数据结构与字段", async () => {
      const f = new FormData();
      f.append("file", file);
      const d = await api("/api/data", { method: "POST", body: f });
      setDataFiles((files) => [
        ...files.filter((v) => v.sha256 !== d.sha256),
        d,
      ]);
      setToast(`已读取 ${d.records} 条数据，制图前将核查字段和统计口径`);
    });
  }
  function importTemplate(file) {
    if (!file) return;
    run("正在读取用户模板", async () => {
      const f = new FormData();
      f.append("file", file);
      const t = await api("/api/templates", { method: "POST", body: f });
      await refresh();
      setTemplateId(t.id);
      setToast("用户模板已替换，现有文档可以直接继续使用");
    });
  }
  function importReference(file) {
    if (!file) return;
    run("正在提取效果参考的完整图解与文字位置", async () => {
      const f = new FormData();
      f.append("file", file);
      await api("/api/references", { method: "POST", body: f });
      await refresh();
      setToast("效果参考已加入素材库，后续生成优先采用其完整图解");
    });
  }
  function importMaterials(files) {
    run("正在提取原生图标、图形和组合元素", async () => {
      const f = new FormData();
      Array.from(files).forEach((file) => f.append("files", file));
      const imported=await api("/api/library/import", { method: "POST", body: f });window.dispatchEvent(new CustomEvent("yeyu-material-import",{detail:imported.taggingJob}));
      await refresh();
      setCatalogPage(1);
      setToast("素材已拆为元素组件");
    });
  }
  async function generate({
    planningOnly = false,
    styleOnly = false,
    outlinePlan,
  } = {}) {
    setError("");
    setJobSnapshot(null);
    setBusy("正在提交自动生成任务");
    try {
      const job = await post("/api/generate", {
        workspaceFolderId,
        styleSkillId,
        planningOnly,
        styleOnly,
        outlinePlan,
        designProfile,
        paletteMode,
        paletteSourceId,
        userColors: paletteMode === "user" ? userColors : undefined,
        institutionName,
        inputMode,
        topic:inputMode==="topic"?document.trim():undefined,
        document: [
          ...(docHash ? [`文档文件：${docName}，SHA256：${docHash}`] : []),
          document,
          ...dataFiles.map((f) => f.text),
        ].join("\n\n"),
        title,
        requirements,
        audience,
        pageCount,
        layoutDensity,
        mode,
        apiKey,
        model,
        prompt,
        templateId,
        chartRequest,
        sourceName: docName || "用户文档",
        sourceProfiles: dataFiles.flatMap((f) =>
          f.profiles.map((p) => ({
            ...p,
            file: f.name,
            sha256: f.sha256,
            issues: f.issues,
          })),
        ),
      });
      setJobSnapshot({ ...job, status: "running" });
      setJobId(job.id);
      setBusy("Hermes 正在加载专业 skills 并理解文档");
    } catch (e) {
      setBusy("");
      setError(e.message);
    }
  }
  async function stopJob() {
    if (!jobSnapshot?.id || jobSnapshot.status==='stopping') return;
    try {const result=await post('/api/jobs/'+jobSnapshot.id+'/stop',{});setJobSnapshot(old=>({...old,status:result.status,phase:result.status==='stopped'?'已停止，进度已保存':'正在停止，等待当前操作安全结束'}));}
    catch(e){setToast(e.message);}
  }
  async function resumeJob(selection) {
    if (!jobSnapshot?.id || resuming) return;
    setResuming(true);
    setError("");
    setBusy("正在读取检查点，继续未完成页面");
    try {
      const job = await post("/api/jobs/" + jobSnapshot.id + "/resume", {
        apiKey,
        model,
        manualSelection: selection?.materialId ? selection : undefined,
      });
      setJobSnapshot({ ...jobSnapshot, ...job, status: "running" });
      setJobId(job.id);
    } catch (e) {
      setBusy("");
      setError(e.message);
    } finally {
      setResuming(false);
    }
  }
  function updateBlock(id, changes) {
    setPlan((p) => ({
      ...p,
      slides: p.slides.map((s, i) =>
        i === page
          ? {
              ...s,
              blocks: s.blocks.map((b) =>
                b.id === id ? { ...b, ...changes } : b,
              ),
            }
          : s,
      ),
    }));
  }
  async function exportEdits() {
    await run("正在导出调整后的 PPT", async () => {
      const out = await post("/api/export", {...plan,baseOutputId:output?.id});
      setOutput({ ...out, render: { status: "queued" } });
      setEditing(false);
      setToast("调整后的可编辑 PPT 已生成");
    });
  }
  async function applyTemplate() {
    await run("正在重新套用用户模板", async () => {
      const revised = await post("/api/recompose", { ...plan, templateId });
      setPlan(revised);
      const out = await post("/api/export", {...revised,baseOutputId:output?.id});
      setOutput({ ...out, render: { status: "queued" } });
      setEditing(false);
      setPage(0);
    });
  }
  function browseMaterials(action = "replace") {
    if(!canViewLibrary)return;
    setPickerMode(action);
    setPicker(true);
    setQ("");
    setType(action === "replace" ? "diagram" : "icon");
    setScope(action === "replace" ? "full" : "all");
    setPurpose(
      action === "replace"
        ? slide?.kind === "agenda"
          ? "agenda"
          : slide?.kind === "cover"
            ? "cover"
            : "content"
        : "all",
    );
    setRelation("all");
    setSourceFilter("");
    setCatalogPage(1);
  }
  async function regenerateCurrent() {
    if (!plan?.sourceText || busy) return;
    setBusy("Hermes 正在重新理解当前文稿并加载 skills");
    setError("");
    try {
      const job = await post("/api/generate", {
        document: plan.sourceText,
        title: plan.title,
        designProfile,
        paletteMode,
        paletteSourceId,
        userColors: paletteMode === "user" ? userColors : undefined,
        institutionName,
        sourceName: plan.sourceName || "当前文稿",
        pageCount: plan.slides.length,
        templateId: plan.templateId,
        mode: "deepseek",
        model,
        apiKey,
        requirements:
          "按当前文稿重新制作，保留事实与数字限定。使用完整可编辑素材，充分利用主体区域，统一用户模板样式，避免内容仅在备注。",
      });
      setPreviousOutput(output);
      setJobId(job.id);
    } catch (e) {
      setBusy("");
      setError(e.message);
    }
  }
  async function replaceMaterial(item) {
    if (!plan || busy || pageWorkBusy) return;
    setError("");
    setBusy("分析新素材：完整对象与可填文字位置");
    try {
      const job = await post("/api/replace-page-material-job", {
        plan,
        baseOutputId: output?.id,
        page,
        componentId: item.id,
        apiKey,
        model,
        mode,
      });
      setPreviousOutput(output);
      setJobId(job.id);
      setPicker(false);
      setDetail(null);
      setTab("create");
    } catch (e) {
      setBusy("");
      setError(e.message);
    }
  }
  async function applyDensity() {
    if (!plan) return;
    const oldOutput = output;
    await run("正在调整本页内容占比", async () => {
      const draft = {
          ...plan,
          slides: plan.slides.map((s, i) =>
            i === page ? { ...s, layoutDensity: densityDraft } : s,
          ),
        },
        reflow = await post("/api/recompose", draft);
      const revised = {
        ...draft,
        slides: draft.slides.map((s, i) => (i === page ? reflow.slides[i] : s)),
      };
      const out = await post("/api/export", {...revised,baseOutputId:output?.id});
      setPreviousOutput(oldOutput);
      setPlan(out.plan);
      setOutput({ ...out, render: { status: "queued" } });
      setEditing(false);
      setToast("已调整本页排版");
    });
  }
  function undoChoice() {
    if (!previousOutput) return;
    setOutput(previousOutput);
    setPlan(previousOutput.plan);
    setPreviousOutput(null);
    setEditing(false);
    setToast("已恢复上次设计");
  }
  function addElement(item) {
    if (!plan) return;
    const b = {
      id: "user-" + Date.now(),
      type: "component",
      componentId: item.id,
      x: 0.5,
      y: 0.4,
      w: 0.25,
      h: 0.25,
      bindText: ["group", "diagram"].includes(item.type),
      textMap: slide.bullets,
      colorMode: "template",
    };
    setPlan((p) => ({
      ...p,
      slides: p.slides.map((s, i) =>
        i === page ? { ...s, blocks: [...s.blocks, b] } : s,
      ),
    }));
    setSelectedBlock(b.id);
    setPicker(false);
    setDetail(null);
    setEditing(true);
    setTab("create");
  }

  return {
    tab,
    setTab:value=>setTab(previous=>{const next=typeof value==='function'?value(previous):value;return next==='library'&&!canViewLibrary?'create':next;}),
    studio,
    setStudio,
    templateId,
    setTemplateId,
    document,
    inputMode,
    setInputMode:next=>{if(next===inputMode)return;accountStore.setItem('yeyu-input-'+(workspaceFolderId||'global')+'-'+inputMode,JSON.stringify({document,docName,docHash,title}));let saved={};try{saved=JSON.parse(accountStore.getItem('yeyu-input-'+(workspaceFolderId||'global')+'-'+next)||'{}');}catch{}setInputMode(next);setDocument(saved.document||'');setDocName(saved.docName||'');setDocHash(saved.docHash||'');setTitle(saved.title||'');},
    setDocument,
    docName,
    setDocName,
    title,
    setTitle,
    requirements,
    setRequirements,
    chartRequest,
    setChartRequest,
    audience,
    setAudience,
    pageCount,
    setPageCount,
    layoutDensity,
    setLayoutDensity,
    mode,
    setMode,
    apiKey,
    setApiKey,
    model,
    setModel,
    dataFiles,
    setDataFiles,
    busy,
    setBusy,
    styleSkillId,setStyleSkillId,openProjectDraft,
    workspaceFolderId,setWorkspaceFolderId,workspaceFolderName,setWorkspaceFolderName,
    pageWorkBusy,setPageWorkBusy,
    photoTargetPreview,setPhotoTargetPreview,
    error,
    setError,
    toast,
    setToast,
    settings,
    setSettings,
    jobId,
    setJobId,
    output,
    setOutput,
    plan,
    setPlan,
    page,
    setPage,
    editing,
    setEditing,
    selectedBlock,
    setSelectedBlock,
    catalog,
    setCatalog,
    q,
    setQ,
    type,
    setType,
    sourceFilter,
    setSourceFilter,
    catalogPage,
    setCatalogPage,
    detail,
    setDetail,
    picker,
    setPicker,
    folder,
    setFolder,
    templatePath,
    setTemplatePath,
    chartPrompt,
    setChartPrompt,
    prompt,
    setPrompt,
    docHash,
    setDocHash,
    jobSnapshot,
    setJobSnapshot,
    resuming,
    setResuming,
    designProfile,
    setDesignProfile,
    paletteMode,
    setPaletteMode,
    paletteSourceId,
    setPaletteSourceId,
    palettePreview,
    setPalettePreview,
    designOptions,
    setDesignOptions,
    userColors,
    setUserColors,
    institutionName,
    setInstitutionName,
    outlineDraft,
    setOutlineDraft,
    liveOutline,
    setLiveOutline,
    recommendations,
    setRecommendations,
    recommendLoading,
    setRecommendLoading,
    setRecommendActive,
    refreshRecommendations,
    recommendScope,
    setRecommendScope,
    densityDraft,
    setDensityDraft,
    previousOutput,
    setPreviousOutput,
    pickerMode,
    setPickerMode,
    scope,
    setScope,
    purpose,
    setPurpose,
    relation,
    setRelation,
    presentationPrompt,
    setPresentationPrompt,
    docInput,
    dataInput,
    templateInput,
    materialInput,
    referenceInput,
    template,
    planTemplate,
    slide,
    block,
    refresh,
    run,
    uploadDoc,
    uploadData,
    importTemplate,
    importReference,
    importMaterials,
    generate,
    resumeJob,
    stopJob,
    updateBlock,
    exportEdits,
    applyTemplate,
    browseMaterials,
    regenerateCurrent,
    replaceMaterial,
    applyDensity,
    undoChoice,
    addElement,
  };
}
