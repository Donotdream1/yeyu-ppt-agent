import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {api} from '@/lib/api';
import React, { useEffect, useState } from "react";
import {
  BookOpen,
  ChartNoAxesCombined,
  Layers,
  CheckCircle2,
  ShieldCheck,
  Palette,
  Save,
  Loader2,
  MousePointer2,
} from "lucide-react";
const icons = {
  "page-edit": MousePointer2,
  "ppt-writing": BookOpen,
  "chart-drawing": ChartNoAxesCombined,
  "material-use": Layers,
  "layout-review": CheckCircle2,
  "harness-review": ShieldCheck,
  "presentation-style": Palette,
};
const descriptions = {
  "page-edit": "逐页对话、文字与布局修改、图片放置与检查",
  "ppt-writing": "文档结构、叙事主线、逐页主题与文案",
  "chart-drawing": "统计口径、真实数据、可编辑图表",
  "material-use": "分析原生组件、要点填充、完整重组",
  "layout-review": "主体占比、素材保留、风格与文字边界",
  "harness-review": "技能契约、五维审查与真实交付证据",
  "presentation-style": "先判断文档用途，再选版式与素材配色",
};
export default function SkillCenter({ trace = [], onRules }) {
  const [data, setData] = useState(null),
    [selected, setSelected] = useState("ppt-writing"),
    [draft, setDraft] = useState(""),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function load() {
    setLoading(true);setLoadError("");
    try {
      const d=await api('/api/skills');
      if(!Array.isArray(d.items)||d.items.some(i=>!i||typeof i.name!=='string'||typeof i.content!=='string'))throw Error('技能配置格式不正确');
      const current=d.items.find(i=>i.name===selected)||d.items[0];
      setData(d);setSelected(current?.name||'');setDraft(current?.content||'');
    }catch(e){setLoadError(e.message||'技能配置读取失败');}finally{setLoading(false);}
  }
  useEffect(() => {void load();}, []);
  async function save() {
    setBusy(true);
    setNotice("");
    try {
      await api("/api/skills/" + encodeURIComponent(selected), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: draft }),
        });
      setData((d) => ({
        ...d,
        items: d.items.map((v) =>
          v.name === selected ? { ...v, content: draft } : v,
        ),
      }));
      setNotice("技能已保存，将用于下一次生成或换版");
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <section className="panel skill-loading" role="status">
        <Loader2 className="spinning" />
        正在读取 Hermes 技能配置
      </section>
    );
  if(loadError)return <section className="panel skill-loading"><p role="alert">{loadError}</p><Button variant="outline" onClick={()=>void load()}>重新加载技能</Button></section>;
  if(!data?.items.length)return <section className="panel skill-loading"><p>暂无可用技能</p><Button variant="outline" onClick={()=>void load()}>重新加载技能</Button></section>;
  const current = data.items.find((s) => s.name === selected),
    Icon = icons[selected] || BookOpen;
  return (
    <div className="skill-center">
      <section className="panel agent-overview">
        <div>
          <span className="eyebrow">HERMES WORKFLOW</span>
          <h2>一个总控，按文档调用专业技能</h2>
          <p>
            由 Hermes 调用技能与原生 PPT 工具，DeepSeek 负责理解、撰写和决策。
          </p>
        </div>
        <span
          className={
            data.runtime?.available ? "skill-runtime ready" : "skill-runtime"
          }
        >
          {data.runtime?.available ? "Hermes 运行时可用" : "运行时待配置"}
        </span>
      </section>
      <div className="skill-card-grid">
        {data.items.map((item) => {
          const ItemIcon = icons[item.name] || BookOpen,
            count = trace.filter((t) => t.skill === item.name).length;
          return (
            <Button
              variant="ghost"
              className={`panel skill-card ${selected === item.name ? "active" : ""}`}
              key={item.name}
              onClick={() => {
                setSelected(item.name);
                setDraft(item.content);
                setNotice("");
              }}
            >
              <ItemIcon size={22} />
              <strong>{item.title}</strong>
              <p>{descriptions[item.name] || '自定义专业技能'}</p>
              <small>
                {count
                  ? "当前稿件已加载 " + count + " 次"
                  : "独立 SKILL.md · 可编辑"}
              </small>
            </Button>
          );
        })}
      </div>
      <section className="panel skill-editor">
        <div className="panel-heading">
          <Icon size={21} />
          <div>
            <h2>{current.title}</h2>
            <p>保存后生效，历史稿件保留原来的素材版本。</p>
          </div>
        </div>
        {selected === "ppt-writing" && (
          <Button
            variant="ghost"
            className="text-link"
            onClick={() => onRules("rules")}
          >
            查看和编辑你的完整 PPT 撰写提示词 →
          </Button>
        )}
        {selected === "chart-drawing" && (
          <Button
            variant="ghost"
            className="text-link"
            onClick={() => onRules("charts")}
          >
            查看和编辑你的完整图表绘制提示词 →
          </Button>
        )}
        <Textarea
          aria-label={current.title + "配置"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
        />
        <div className="prompt-editor-foot">
          <span>
            {notice || "技能限定在本项目的文档、素材和导出工具范围内"}
          </span>
          <Button
            variant="ghost"
            className="button primary"
            disabled={busy}
            onClick={save}
          >
            <Save size={15} />
            保存技能
          </Button>
        </div>
      </section>
    </div>
  );
}
