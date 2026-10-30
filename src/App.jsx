import AccountMenu from '@/components/workspace/AccountMenu';
import BrandMark from '@/components/BrandMark';
import React, { useEffect, useState, useRef, lazy, Suspense } from "react";
import {
  Layers,
  Sparkles,
  Clock3,
  LayoutTemplate,
  Settings2,
  LogOut,
  BookOpen,
  Menu,
  Plus,
  Upload,
  FolderOpen,
  X,
  Workflow,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import { Toaster } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { useStudio } from "@/hooks/use-studio";
import { api, post } from "@/lib/api";
import {readWorkspaceLocation,presentationPath,jobPath,tabPath} from '@/lib/routes';
import { preparationKey } from "@/lib/journey";
import Preparation from "@/components/workspace/ChatPreparation";
import Outline from "@/components/workspace/Outline";
import Production from "@/components/workspace/Production";
import Review from "@/components/workspace/Review";
import History from "@/components/workspace/History";
import {
  Templates,
  Rules,
  ModelSettings,
} from "@/components/workspace/Resources";
const TaggedMaterialLibrary=lazy(()=>import('@/TaggedMaterialLibrary'));
import HermesWorkspace from "@/components/workspace/HermesWorkspace";
import SettingsPage from '@/components/workspace/SettingsPage';
import {useAuth} from '@/components/AuthGate';
import {accountStorage} from '@/lib/account-storage';

const ProjectHub=lazy(()=>import('@/components/workspace/ProjectHub'));
const StyleMarket=lazy(()=>import('@/components/workspace/StyleMarket'));
import HomeResources from '@/components/workspace/HomeResources';
import ProjectCreateDialog from '@/components/workspace/ProjectCreateDialog';
const navigation = [
  ["projects", "项目", FolderOpen],
  ["styles", "版式与Skills", Palette],
  ["create", "创作工作台", Sparkles],
  ["history", "最近作品", Clock3],
  ["hermes", "Hermes 工作台", Workflow],
  ["library", "单页素材库", Layers],
  ["templates", "我的模板", LayoutTemplate],
];
const headings = {
  projects:['项目','项目',''],styles:['版式与Skills','版式与Skills',''],
  settings:['设置','设置',''],
  hermes: [
    "Hermes 工作台",
    "看见每一步，理解每一页",
    "查看Hermes的角色分工、专业技能、真实工具调用与任务恢复状态。",
  ],
  create: [
    "创作工作台",
    "让内容，成为清晰的演示",
    "从一份文档出发，结合你的模板与原生素材，完成整套PPT。",
  ],
  history: [
    "最近作品",
    "每一份成果，都留在这里",
    "查看、下载已有作品，或继续调整某一页的设计。",
  ],
  library: [
    "单页素材库",
    "先找到适合内容的设计",
    "按用途、结构和文字容量筛选，保留素材原有配色与编辑能力。",
  ],
  templates: [
    "我的模板",
    "用熟悉的模板，讲新的内容",
    "统一封面、Logo与页面底稿，让每一次汇报都有一致的形象。",
  ],
  skills: [
    "规则与技能",
    "把你的制作经验，沉淀为规则",
    "管理撰写、图表和素材使用技能，应用到下一次制作。",
  ],
  rules: [
    "规则与技能",
    "把你的制作经验，沉淀为规则",
    "管理撰写、图表和素材使用技能，应用到下一次制作。",
  ],
  charts: [
    "规则与技能",
    "把你的制作经验，沉淀为规则",
    "管理撰写、图表和素材使用技能，应用到下一次制作。",
  ],
};
function initialStep(user) {
  try {
    const route=readWorkspaceLocation(window.location);if(route.jobId)return 'generate';if(route.outputId||route.publicId)return 'review';
    if (accountStorage(user).getItem("shiye-active-job"))
      return accountStorage(user,'session').getItem("shiye-journey-stage") || "generate";
  } catch {}
  return "prepare";
}

export default function App() {
  const auth=useAuth();
  const accountStore=accountStorage(auth?.user),accountSession=accountStorage(auth?.user,'session');
  const s = useStudio(),
    [step, setStep] = useState(()=>initialStep(auth?.user)),
    [outlineBasis, setOutlineBasis] = useState(""),
    [mobileMenu, setMobileMenu] = useState(false),
    [collapsed,setCollapsed]=useState(()=>{const saved=accountSession.getItem('sidebar-collapsed');return saved===null?(auth?.user?.preferences?.personalization?.sidebarCollapsed??true):saved==='true';}),
    [recent,setRecent]=useState([]),
    [searchOpen,setSearchOpen]=useState(false),[projectDialog,setProjectDialog]=useState(false),[projects,setProjects]=useState([]),[projectView,setProjectView]=useState(()=>accountSession.getItem('selected-project')||''),[pendingDoc,setPendingDoc]=useState(null),
    [settingsSection,setSettingsSection]=useState(readWorkspaceLocation(window.location).settingsSection||'account'),[settingsOrigin,setSettingsOrigin]=useState('create');
  useEffect(()=>{if(auth?.user?.preferences?.model)s.setModel(auth.user.preferences.model);},[auth?.user?.id]);
  useEffect(()=>{if(s.settings){setSettingsSection(typeof s.settings==='string'?s.settings:'model');s.setSettings(false);s.setTab('settings');}},[s.settings]);
  useEffect(()=>{let live=true;api('/api/outputs?limit=8').then(value=>{if(live)setRecent(value.items||[]);}).catch(()=>{});return()=>{live=false;};},[s.output?.id]);
  useEffect(()=>{const refresh=()=>api('/api/outputs?limit=8').then(v=>setRecent(v.items||[])).catch(()=>{});window.addEventListener('yeyu-library-change',refresh);return()=>window.removeEventListener('yeyu-library-change',refresh);},[]);
  useEffect(()=>{let live=true;const load=()=>api('/api/workspace/folders').then(v=>{if(live)setProjects(v.items);}).catch(()=>{});void load();window.addEventListener('yeyu-library-change',load);return()=>{live=false;window.removeEventListener('yeyu-library-change',load);};},[]);
  useEffect(()=>{const handle=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setSearchOpen(true);}};window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[]);
  useEffect(()=>{const p=auth?.user?.preferences?.presentation;if(!p)return;if(p.templateId&&s.studio.templates.some(t=>t.id===p.templateId))s.setTemplateId(p.templateId);if(p.styleSkillId)s.setStyleSkillId(p.styleSkillId);s.setPageCount(p.pageCount);s.setLayoutDensity(p.layoutDensity);},[auth?.user?.preferences?.presentation,s.studio.templates]);
  const previousSidebarPreference=useRef(auth?.user?.preferences?.personalization?.sidebarCollapsed);
  useEffect(()=>{const value=auth?.user?.preferences?.personalization?.sidebarCollapsed;if(previousSidebarPreference.current!==value){previousSidebarPreference.current=value;setCollapsed(value??true);}},[auth?.user?.preferences?.personalization?.sidebarCollapsed]);
  useEffect(()=>accountSession.setItem('sidebar-collapsed',String(collapsed)),[collapsed]);
  useEffect(()=>{const p=auth?.user?.preferences?.personalization;document.documentElement.dataset.uiSize=p?.fontSize||'standard';document.documentElement.dataset.reducedMotion=String(p?.reducedMotion||false);return()=>{delete document.documentElement.dataset.uiSize;delete document.documentElement.dataset.reducedMotion;};},[auth?.user?.preferences?.personalization]);
  useEffect(()=>{if(projectView)accountSession.setItem('selected-project',projectView);},[projectView]);
  const heading = headings[s.tab] || headings.create,
    key = preparationKey(s),
    stale = Boolean(s.outlineDraft && outlineBasis && outlineBasis !== key);
  useEffect(() => {
    if (s.toast) toast.success(s.toast);
  }, [s.toast]);
  useEffect(() => {
    if (s.output?.id && !s.jobId) setStep("review");
  }, [s.output?.id]);
  useEffect(() => {
    if (s.outlineDraft && !outlineBasis) setOutlineBasis(key);
  }, [s.outlineDraft]);
  useEffect(() => {
    try {
      accountSession.setItem("shiye-journey-stage", step);
    } catch {}
  }, [step]);
  useEffect(() => {
    const route=readWorkspaceLocation(window.location);let path=tabPath(s.tab);
    if(s.tab==='create'){if(s.output?.id)path=presentationPath(s.output.publicId||s.output.id,s.page);else if(s.jobId||['failed','stopped'].includes(s.jobSnapshot?.status)&&step==='generate')path=jobPath(s.jobId||s.jobSnapshot.id);else if(route.outputId||route.publicId||route.jobId)return;}
    if(s.tab==='settings'&&settingsSection!=='account')path='/settings/'+settingsSection;
    window.history.replaceState(window.history.state,'',path);
  }, [s.tab,s.output?.id,s.page,s.jobId,s.jobSnapshot?.status,step,settingsSection]);
  const go = (tab) => {
    if(tab==='library'&&auth?.user?.role!=='owner')tab='create';
    const path=tab==='create'?(s.output?presentationPath(s.output.publicId||s.output.id,s.page):'/workspace'):tabPath(tab);if(location.pathname!==path)window.history.pushState(null,'',path);
    if(tab==='settings'&&s.tab!=='settings')setSettingsOrigin(s.tab);
    s.setTab(tab);
    setMobileMenu(false);
  };
  useEffect(()=>{const handle=async()=>{const route=readWorkspaceLocation(window.location);if(route.tab==='library'&&auth?.user?.role!=='owner'){window.history.replaceState(null,'','/workspace');s.setTab('create');return;}s.setTab(route.tab);if(route.tab==='settings')setSettingsSection(route.settingsSection||'account');if(route.outputId||route.publicId){try{const id=route.outputId||(await api('/api/links/'+route.publicId)).outputId,out=await api('/api/outputs/'+id);s.setOutput(out);s.setPlan(out.plan);s.setPage(Math.min(route.page,out.pages-1));setStep('review');}catch(error){s.setError(error.message);}}else if(route.jobId){s.setJobId(route.jobId);setStep('generate');}else if(route.tab==='create'){s.setOutput(null);s.setPlan(null);setStep('prepare');}};window.addEventListener('popstate',handle);return()=>window.removeEventListener('popstate',handle);},[]);
  useEffect(()=>{document.title=s.tab==='create'&&s.output?`${s.output.title} · 第${s.page+1}页 | 叙帧`:`${heading[0]} | 叙帧`;},[s.tab,s.output?.id,s.page]);
  const start = (folderId=null,folderName='') => {
    if(typeof folderId!=='string'){setProjectDialog(true);return;}
    s.openProjectDraft(folderId,folderName);
    if (s.busy) return;
    try {
      accountStore.removeItem("shiye-active-job");
    } catch {}
    s.setOutput(null);
    s.setPlan(null);
    s.setOutlineDraft(null);
    s.setLiveOutline(null);
    s.setJobSnapshot(null);
    s.setError("");
    setOutlineBasis("");
    setStep("prepare");
    s.setTab('create');setMobileMenu(false);if(window.location.pathname!=='/workspace')window.history.pushState(null,'','/workspace');
  };
  const plan = () => {
    if(!s.workspaceFolderId){setProjectDialog(true);return;}
    setOutlineBasis(key);
    s.setOutlineDraft(null);
    setStep("outline");
    void s.generate({ planningOnly: true });
  };
  const generate = () => {
    if (stale) return;
    setStep("generate");
    void s.generate({ outlinePlan: s.outlineDraft });
  };
  const [reviewReturn,setReviewReturn]=useState(()=>{try{return accountStorage(auth?.user,'session').getItem('review-return')||'history';}catch{return 'history';}});
  const backToWorks=()=>{s.setOutput(null);setStep('prepare');go(reviewReturn);};
  const openOutput = async (id,page=0) => {
    const origin=s.tab==='create'?'history':s.tab;setReviewReturn(origin);accountStorage(auth?.user,'session').setItem('review-return',origin);
    await s.run("正在打开作品", async () => {
      const value = await api("/api/outputs/" + id);
      s.setOutput(value);
      s.setPlan(value.plan);
      s.setPage(Math.max(0,Math.min(typeof page==='number'?page:0,value.pages-1)));
      s.setJobSnapshot(null);
      try {
        accountStore.removeItem("shiye-active-job");
      } catch {}
      setStep("review");
      go("create");
    });
  };
  const sidebar = (
    <>
      <div className="chat-sidebar-heading"><a className="app-brand" href="/workspace" aria-label="叙帧首页">
        <span>
          <BrandMark size={30} />
        </span>
        <div>
          叙帧<small>PPT 智能体工作台</small>
        </div>
      </a><Button className="sidebar-collapse-toggle" variant="ghost" size="icon" aria-label={collapsed?'展开侧栏':'收起侧栏'} title={collapsed?'展开侧栏':'收起侧栏'} aria-expanded={!collapsed} aria-controls="desktop-sidebar" onClick={()=>setCollapsed(v=>!v)}>{collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</Button></div>
      <Button className="new-presentation" aria-label="开始一份PPT" title="新建项目" disabled={!!s.busy} onClick={start}>
        <Plus />
        <span className="sidebar-item-label">开始一份PPT</span>
      </Button>
      <div className="sidebar-label">工作空间</div>
      <Button variant="ghost" className="chat-sidebar-search" aria-label="搜索演示" title="搜索演示" onClick={()=>setSearchOpen(true)}><Search size={17}/><span className="sidebar-item-label">搜索演示</span><kbd>Ctrl K</kbd></Button>
      <nav className="primary-nav">
        {navigation.filter(([id])=>id!=='library'||auth?.user?.role==='owner').map(([id, label, Icon]) => (
          <Button
            key={id}
            variant="ghost"
            aria-current={s.tab === id ? "page" : undefined}
            className={s.tab === id ? "active" : ""}
            title={label}
            aria-label={label}
            onClick={() => go(id)}
          >
            <Icon size={18} />
            <span className="sidebar-item-label">{label}</span>
            {s.tab === id && <span className="nav-active-dot" />}
          </Button>
        ))}
      </nav>
      <div className="sidebar-projects"><div className="sidebar-project-heading"><span>项目</span><button type="button" aria-label="新建项目" onClick={()=>setProjectDialog(true)}><Plus size={14}/></button></div>{projects.slice(0,5).map(p=><button type="button" key={p.id} onClick={()=>{setProjectView(p.id);go('projects');}}><FolderOpen size={15}/><span>{p.name}</span></button>)}</div>
      <div className="sidebar-recents"><div className="sidebar-label">最近演示</div>{recent.slice(0,7).map(item=><button type="button" key={item.id} title={item.title} onClick={()=>void openOutput(item.id)}>{item.title}</button>)}</div>
      <div className="sidebar-bottom">
        <Button
          variant="ghost"
          className={
            ["settings", "rules", "charts", "skills"].includes(s.tab) ? "active" : ""
          }
          aria-label="设置" title="设置"
          onClick={() => {setSettingsSection('account');go("settings");}}
        >
          <Settings2 size={17} />
          <span className="sidebar-item-label">设置</span>
        </Button>
        <AccountMenu user={auth.user} onSettings={()=>{setSettingsSection('account');go('settings');}} onPersonalization={()=>{setSettingsSection('personalization');go('settings');}} onHelp={()=>{setSettingsSection('help');go('settings');}} onLogout={()=>void auth.logout().catch(e=>s.setError(e.message))}/>
      </div>
    </>
  );
  const producing = Boolean(
    s.jobId ||
    (s.busy && ["outline", "generate"].includes(step)) ||
    (["failed","stopped"].includes(s.jobSnapshot?.status) &&
      ["outline", "generate"].includes(step)),
  );
  return (
    <TooltipProvider>
      <div data-ui-size={auth?.user?.preferences?.personalization?.fontSize||'standard'} data-reduced-motion={auth?.user?.preferences?.personalization?.reducedMotion||false} className={`studio-app chatgpt-layout ${collapsed?'sidebar-collapsed':''}`}>
        <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent className="chat-search-dialog"><DialogHeader><DialogTitle>搜索演示</DialogTitle><DialogDescription>搜索已有作品，打开后继续逐页对话修改。</DialogDescription></DialogHeader><History compact onOpen={async id=>{setSearchOpen(false);await openOutput(id);}} disabled={!!s.busy}/></DialogContent></Dialog>
        <ProjectCreateDialog open={projectDialog} onOpenChange={setProjectDialog} onCreated={p=>{const draft=!s.workspaceFolderId?s.document:'';start(p.id,p.name);if(draft)s.setDocument(draft);if(pendingDoc){s.uploadDoc(pendingDoc,p.id);setPendingDoc(null);}}}/>
        <aside id="desktop-sidebar" className="app-sidebar" aria-label="主导航侧栏">{sidebar}</aside>
        <div className="app-main">
          <header className="app-topbar">
            <div>
              <Button
                variant="ghost"
                size="icon"
                className="mobile-nav-toggle"
                aria-label="打开导航"
                onClick={() => setMobileMenu(true)}
              >
                <Menu />
              </Button>
              <strong className="chat-product-switch">叙帧 <ChevronDown size={16}/></strong><span className="chat-current-module">{heading[0]}</span>
            </div>
          </header>
          <main
            className={
              s.tab === "create" && step === "review"
                ? "main-content review-content"
                : "main-content"+(s.tab==='create'&&step==='prepare'?' chat-home':'')
            }
          >
            {!["projects","styles","hermes"].includes(s.tab)&&!(s.tab === "create" && step === "review") && (
              <div className="workspace-heading">
                <div>
                  <span className="small-kicker">
                    {s.tab === "create"
                      ? "DOCUMENT TO PRESENTATION"
                      : s.tab === "library"
                        ? "YOUR EDITABLE MATERIALS"
                        : "XUZHEN WORKSPACE"}
                  </span>
                  <h1>{heading[1]}</h1>
                  <p>{heading[2]}</p>
                </div>
            {s.tab === "history" && (
                  <Button disabled={!!s.busy} onClick={start}>
                    <Plus />
                    开始一份PPT
                  </Button>
                )}
              </div>
            )}
            {s.error && (
              <div className="notice warning global-error" role="alert">
                <span>{s.error}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="关闭错误提示"
                  onClick={() => s.setError("")}
                >
                  <X />
                </Button>
              </div>
            )}
            {s.tab === "create" && (
              <section className="creation-workbench" aria-label="创作工作台">
                {step === "prepare" && s.workspaceFolderId&&<div className="workspace-folder-context"><FolderOpen size={15}/>{s.workspaceFolderName}<Button variant="ghost" size="icon" aria-label="取消当前文件夹" onClick={()=>{s.setWorkspaceFolderId(null);s.setWorkspaceFolderName('');}}><X size={14}/></Button></div>}
                {step === "prepare" && (
                  <Preparation
                    s={s}
                    onPlan={plan}
                    onOutline={s.outlineDraft?()=>setStep('outline'):undefined}
                    stale={stale}
                    onNewProject={file=>{if(file?.name)setPendingDoc(file);setProjectDialog(true);}}
                    onSettings={() => s.setSettings(true)}
                  />
                )}
                {step === "prepare"&&<HomeResources s={s} onProject={id=>{setProjectView(id);go('projects');}} onOpen={openOutput} onNewProject={()=>setProjectDialog(true)}/>}
                {step === "outline" &&
                  (producing ? (
                    <Production s={s} planning />
                  ) : (
                    <Outline
                      s={s}
                      stale={stale}
                      onBack={() => setStep("prepare")}
                      onPlan={plan}
                      onGenerate={generate}
                    />
                  ))}
                {step === "generate" && <Production s={s} />}
                {step === "review" && s.output && (
                  <Review s={s} onBack={backToWorks} />
                )}
              </section>
            )}
            {s.tab==='projects'&&<Suspense fallback={<p>正在载入项目…</p>}><ProjectHub s={s} onStart={start} onOpen={openOutput} initialProject={projectView} onSelectProject={setProjectView}/></Suspense>}
            {s.tab==='styles'&&<Suspense fallback={<p>正在载入Skills…</p>}><StyleMarket s={s}/></Suspense>}
            {s.tab === "history" && (
              <History onOpen={openOutput} onNew={start} disabled={!!s.busy} />
            )}
            {s.tab === "hermes" && (
              <HermesWorkspace s={s} onOpen={openOutput} />
            )}
            {s.tab === "library" && auth?.user?.role==='owner' && (
              <>
                <Accordion
                  type="single"
                  collapsible
                  className="library-import-accordion"
                >
                  <AccordionItem value="import">
                    <AccordionTrigger>添加或更新素材库</AccordionTrigger>
                    <AccordionContent>
                      <div className="inline-controls">
                        <Input
                          aria-label="素材库路径"
                          value={s.folder}
                          onChange={(e) => s.setFolder(e.target.value)}
                          placeholder="PPT素材库文件夹路径"
                        />
                        <Button
                          variant="outline"
                          disabled={!!s.busy || !s.folder.trim()}
                          onClick={() =>
                            s.run("正在扫描素材文件夹", async () => {
                              await post("/api/library/scan", {
                                path: s.folder,
                              });
                              await s.refresh();
                              s.setToast(
                                "素材文件夹扫描完成，可重新分析单页标签",
                              );
                            })
                          }
                        >
                          <FolderOpen />
                          扫描文件夹
                        </Button>
                        <Button
                          disabled={!!s.busy}
                          onClick={() => s.materialInput.current.click()}
                        >
                          <Upload />
                          导入素材PPT
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                <Suspense fallback={<p>正在载入素材库…</p>}><TaggedMaterialLibrary /></Suspense>
              </>
            )}
            {s.tab === "templates" && <Templates s={s} />}
            {["settings","rules", "charts", "skills"].includes(s.tab) && <SettingsPage s={s} onOpen={openOutput} initialSection={settingsSection} onSectionChange={setSettingsSection} onClose={()=>go(settingsOrigin)} />}
          </main>
        </div>
        <Sheet open={mobileMenu} onOpenChange={setMobileMenu}>
          <SheetContent side="left" className="mobile-navigation">
            <SheetHeader className="sr-only">
              <SheetTitle>工作空间导航</SheetTitle>
              <SheetDescription>选择创作、素材、模板或作品。</SheetDescription>
            </SheetHeader>
            {sidebar}
          </SheetContent>
        </Sheet>
        <Sheet open={s.picker} onOpenChange={s.setPicker}>
          <SheetContent side="right" className="material-picker-sheet">
            <SheetHeader>
              <SheetTitle>为第 {s.page + 1} 页挑选设计</SheetTitle>
              <SheetDescription>
                选择后重新分析素材、适配本页文案并检查，其他页面保留。
              </SheetDescription>
            </SheetHeader>
            <div className="material-picker-body">
              <TaggedMaterialLibrary
                onChoose={(id) => s.replaceMaterial({ id })}
              />
            </div>
          </SheetContent>
        </Sheet>
        <input
          className="sr-only"
          tabIndex={-1}
          type="file"
          ref={s.docInput}
          accept=".docx,.pdf,.txt,.md,.markdown"
          onChange={(e) => {
            s.uploadDoc(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <input
          className="sr-only"
          tabIndex={-1}
          type="file"
          ref={s.templateInput}
          accept=".pptx"
          onChange={(e) => {
            s.importTemplate(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <input
          className="sr-only"
          tabIndex={-1}
          type="file"
          ref={s.materialInput}
          multiple
          accept=".pptx"
          onChange={(e) => {
            s.importMaterials(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          className="sr-only"
          tabIndex={-1}
          type="file"
          ref={s.referenceInput}
          accept=".pptx"
          onChange={(e) => {
            s.importReference(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <input
          className="sr-only"
          tabIndex={-1}
          type="file"
          ref={s.dataInput}
          accept=".csv,.tsv,.json,.xlsx"
          onChange={(e) => {
            s.uploadData(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <Toaster position="bottom-right" richColors theme="light" />
      </div>
    </TooltipProvider>
  );
}
