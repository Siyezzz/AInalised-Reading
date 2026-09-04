'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Brain, Check, ChevronLeft, CircleHelp, Compass, Flame, Library, Lightbulb, ListTree, MessageCircleMore, RotateCcw, Sparkles, Target, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Mode = '故事' | '学生' | '深读';
type Feedback = '没看懂' | '太简单' | '太啰嗦' | '看看原文';

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: {
        name: string;
        title: string;
        description: string;
        inputSchema: object;
        annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
        execute: (input: unknown) => unknown;
      }, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
  }
}

const versions: Record<Mode, { eyebrow: string; body: React.ReactNode }> = {
  故事: { eyebrow: '为你增强了冲突与悬念', body: <><p>唐僧以为危险已经过去，没想到山路尽头又出现了那个送饭的姑娘。</p><p>孙悟空一眼就认出来了：这不是凡人，而是刚才逃走的白骨精。可在唐僧眼里，悟空举棒的样子，比妖怪更像妖怪。</p><p className="reader-emphasis">真正危险的，也许不只是妖怪——而是师徒之间正在消失的信任。</p></> },
  学生: { eyebrow: '根据你的弱项，突出人物动机与证据', body: <><p>白骨精第二次变化身份，利用唐僧的善良，让孙悟空看起来像一个滥杀无辜的人。</p><p>孙悟空的行为看似冲动，实际有明确动机：保护唐僧。他能识破妖怪，却无法让师父看见自己看见的事实。这构成了本章最重要的矛盾——能力与信任并不总是同时存在。</p><p className="reader-emphasis">阅读重点：判断人物不能只看行为，还要结合动机和掌握的信息。</p></> },
  深读: { eyebrow: '把情节连接到更深的主题', body: <><p>三打白骨精表面写降妖，深处却写认知的困境：掌握真相的人，未必拥有解释真相的权力。</p><p>唐僧相信眼前可见的弱者，孙悟空相信火眼金睛揭示的本质。两人都在坚持自己的“正确”，冲突因此不再是善恶之间的冲突，而是两种判断世界的方法之间的冲突。</p><p className="reader-emphasis">想一想：善良如果缺少辨别力，会不会也可能造成伤害？</p></> },
};

const feedbackCopy: Record<Feedback, string> = {
  没看懂: '已记下：下一段会减少抽象词，并补充人物关系。',
  太简单: '已记下：下一段将增加原文比例与推理难度。',
  太啰嗦: '已记下：下一段会缩短约 25%，保留关键因果。',
  看看原文: '已切换原著对照。系统会观察哪些句子需要解释。',
};

export default function Home() {
  const [mode, setMode] = useState<Mode>('学生');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [answer, setAnswer] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [chapter, setChapter] = useState(27);
  const [original, setOriginal] = useState(false);
  const [profileVersion, setProfileVersion] = useState(12);

  useEffect(() => {
    const saved = window.localStorage.getItem('zhiji-reading-state');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { mode?: Mode; chapter?: number; profileVersion?: number };
      if (parsed.mode) setMode(parsed.mode);
      if (parsed.chapter) setChapter(parsed.chapter);
      if (parsed.profileVersion) setProfileVersion(parsed.profileVersion);
    } catch {}
  }, []);
  useEffect(() => { window.localStorage.setItem('zhiji-reading-state', JSON.stringify({ mode, chapter, profileVersion })); }, [mode, chapter, profileVersion]);
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({
        name: 'set_reading_mode',
        title: '调整名著讲法',
        description: '将当前章节切换为故事、学生或深读讲法，并更新可见内容。',
        inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['故事', '学生', '深读'] } }, required: ['mode'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          const next = (input as { mode?: string })?.mode;
          if (next !== '故事' && next !== '学生' && next !== '深读') throw new Error('mode 必须是故事、学生或深读');
          setMode(next);
          setProfileVersion(v => v + 1);
          return { mode: next, chapter, status: 'updated' };
        },
      }, { signal: lifecycle.signal });
      await context.registerTool({
        name: 'record_reading_feedback',
        title: '记录阅读反馈',
        description: '记录用户对当前段落的感受，让后续讲法随之调整。',
        inputSchema: { type: 'object', properties: { feedback: { type: 'string', enum: ['没看懂', '太简单', '太啰嗦', '看看原文'] } }, required: ['feedback'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          const value = (input as { feedback?: string })?.feedback;
          if (!value || !(value in feedbackCopy)) throw new Error('feedback 不受支持');
          respond(value as Feedback);
          return { feedback: value, profileVersion: profileVersion + 1, status: 'learned' };
        },
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [chapter, profileVersion]);
  const progress = useMemo(() => Math.min(100, 42 + (chapter - 27) * 6), [chapter]);

  function respond(type: Feedback) { setFeedback(type); setProfileVersion(v => v + 1); if (type === '看看原文') setOriginal(true); }
  function submitAnswer() { if (answer === null) return; setSubmitted(true); setProfileVersion(v => v + 1); }
  function nextChapter() { setChapter(v => v + 1); setAnswer(null); setSubmitted(false); setFeedback(null); setOriginal(false); }

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#reader" aria-label="知己读书首页"><span className="brand-mark"><BookOpen size={19}/></span><span>知己读书</span><span className="beta">实验版</span></a>
      <nav className="topnav" aria-label="主导航"><a className="active" href="#reader">正在读</a><a href="#growth">阅读成长</a><a href="#library">发现好书</a></nav>
      <div className="streak"><Flame size={16}/> 连续阅读 6 天</div>
      <Button variant="ghost" size="icon" aria-label="个人资料" className="avatar-button"><UserRound size={18}/></Button>
    </header>

    <section className="workspace" id="reader">
      <aside className="book-rail" aria-label="章节目录">
        <Button variant="ghost" size="sm" className="back-button"><ChevronLeft/> 我的书架</Button>
        <div className="book-cover" role="img" aria-label="西游记，吴承恩著"><span className="cover-kicker">中国古典名著</span><strong>西游记</strong><span className="cover-rule"/><small>吴承恩 · 著</small></div>
        <div className="book-meta"><div><span>本书进度</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{width:`${progress}%`}}/></div><p>预计还需 3 小时 20 分钟</p></div>
        <div className="toc"><p className="section-label">当前单元 · 真假与信任</p>{[25,26,27,28,29].map(item => <button key={item} className={item===chapter?'current':item<chapter?'done':''} onClick={()=>setChapter(item)}><span>{item<chapter?<Check size={13}/>:item}</span><div><strong>第 {item} 回</strong><small>{item===27?'三打白骨精':item<27?'山中遇险':'师徒离心'}</small></div></button>)}</div>
      </aside>

      <article className="reader-panel">
        <div className="chapter-head"><div><p className="section-label">第 {chapter} 回 · 精读 2/4</p><h1>{chapter===27?'谁看见了真正的妖怪？':'离开之后，谁先后悔？'}</h1></div><div className="mode-switch" aria-label="阅读讲法">{(['故事','学生','深读'] as Mode[]).map(item=><button key={item} className={mode===item?'selected':''} onClick={()=>setMode(item)}>{item}</button>)}</div></div>
        <div className="adaptive-note"><Sparkles size={15}/> {versions[mode].eyebrow}</div>
        <div className="story-text">{versions[mode].body}</div>
        {original && <blockquote className="original-card"><span>原著对照</span>“那大圣棍起处，打倒妖魔，才断绝了灵光。唐僧肉眼凡胎，却只认作伤人。”<small>原文经过节选。划过难句，可以请求另一种解释。</small></blockquote>}
        <div className="feedback-row" aria-label="调整讲法"><span>这一段读起来怎么样？</span>{(['没看懂','太简单','太啰嗦','看看原文'] as Feedback[]).map(item=><button key={item} className={feedback===item?'picked':''} onClick={()=>respond(item)}>{item==='没看懂'&&<CircleHelp size={15}/>} {item==='太简单'&&<Brain size={15}/>} {item==='太啰嗦'&&<ListTree size={15}/>} {item==='看看原文'&&<BookOpen size={15}/>} {item}</button>)}</div>
        {feedback&&<div className="learning-toast"><Sparkles size={15}/> {feedbackCopy[feedback]}</div>}

        <section className="question-card">
          <div className="question-top"><span className="question-icon"><Lightbulb size={18}/></span><div><p>为你出的理解题</p><small>训练你的薄弱项：人物动机</small></div><span className="level-pill">刚刚好</span></div>
          <h2>孙悟空为什么明知会被师父责怪，仍要打白骨精？</h2>
          <div className="answers">{['他控制不住自己的脾气','他想证明自己的本领比师父强','他看见了危险，并把保护师父放在被理解之前'].map((item,index)=><button key={item} className={`${answer===index?'chosen':''} ${submitted&&index===2?'correct':''}`} onClick={()=>!submitted&&setAnswer(index)}><span>{String.fromCharCode(65+index)}</span>{item}{submitted&&index===2&&<Check className="answer-check" size={17}/>}</button>)}</div>
          {submitted?<div className="answer-result"><div><strong>{answer===2?'答对了，而且这正是本章的关键。':'再看一次“保护”和“被理解”的先后关系。'}</strong><p>我发现你能抓住行为背后的动机。下一题会减少提示，让你自己寻找证据。</p></div><Button onClick={nextChapter} className="primary-action">进入下一段 <ArrowRight/></Button></div>:<Button disabled={answer===null} onClick={submitAnswer} className="submit-answer">提交答案</Button>}
        </section>
      </article>

      <aside className="insight-rail" id="growth">
        <div className="profile-card"><div className="profile-title"><div><Sparkles size={17}/></div><span><strong>你的阅读模型</strong><small>已进化至 v{profileVersion}</small></span></div><p className="profile-copy">每次阅读和回答，都在让下一章更适合你。</p><div className="ability-list"><div><span><Target size={15}/> 情节理解</span><strong>82</strong><i><b style={{width:'82%'}}/></i></div><div><span><MessageCircleMore size={15}/> 人物动机</span><strong>61</strong><i><b className="amber" style={{width:submitted?'66%':'61%'}}/></i></div><div><span><Compass size={15}/> 主题思考</span><strong>48</strong><i><b className="violet" style={{width:'48%'}}/></i></div></div><div className="focus-box"><span>本章正在适应</span><strong>用冲突吸引你，用追问训练人物动机</strong></div></div>
        <div className="next-path"><div className="side-heading"><span><Library size={16}/> 接下来的路径</span><button aria-label="重置推荐"><RotateCcw size={14}/></button></div><ol><li className="now"><span>现在</span><div><strong>识破白骨精</strong><small>人物动机 · 约 6 分钟</small></div></li><li><span>下一步</span><div><strong>被误解后的选择</strong><small>降低提示，寻找原文证据</small></div></li><li><span>之后</span><div><strong>真假美猴王</strong><small>跨章节比较 · 由你的表现决定</small></div></li></ol></div>
        <div className="principle-card"><Brain size={18}/><div><strong>不会越读越简单</strong><p>系统会逐步减少帮助，让你越来越接近原著。</p></div></div>
        <img className="concept-art" src="/og.png" alt="打开的古典书页连接出一条不断生长的阅读路径" />
      </aside>
    </section>
  </main>;
}
