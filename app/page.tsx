'use client';
import {useEffect,useState} from 'react';
import {BookOpen,Check,ChevronLeft,ChevronRight,CircleAlert,RotateCcw,Sparkles,X} from 'lucide-react';
type Feedback='有点难'|'刚刚好'|'想读深一点';
type Scene={title:string;paragraphs:string[];original?:string};
type Option={text:string;correct?:boolean;why:string};
type Chapter={no:number;title:string;focus:string;scenes:Scene[];question:string;options:Option[]};
const chapters:Chapter[]=[
{no:27,title:'三打白骨精',focus:'看清误会怎样一步步形成',scenes:[
{title:'白虎岭上',paragraphs:['师徒四人离开五庄观，走进白虎岭。唐僧又饿又乏，让孙悟空去找吃的。悟空看见南山有一片熟透的山桃，便让八戒、沙僧照看师父，自己驾云去摘。','山上的白骨精早已盯上唐僧。她知道悟空难对付，便趁他不在，变成一个提着斋饭的年轻女子。八戒闻见饭香立刻动了心。唐僧虽有疑虑，却看不出眼前人藏着危险。']},
{title:'第一棒',paragraphs:['悟空回来时，一眼认出女子身上的妖气。他不等白骨精靠近师父，举棒便打。白骨精使了脱身法，丢下一具假尸，真身逃回云里。','唐僧没有火眼金睛。他只看见一个送饭女子倒在地上。八戒又说悟空是化斋无功，故意伤人遮掩。唐僧越听越怒，念起紧箍咒。悟空疼得满地打滚，仍坚持说那是妖怪。'],original:'行者认得他是妖精，更不理论，举棒照头便打。那怪使个解尸法，预先走了。'},
{title:'第二次变化',paragraphs:['白骨精又变成一个老妇人，拄着竹杖来找女儿。唐僧见老人悲痛，再看地上的尸体，更相信悟空闯下大祸。','悟空知道这是同一个妖怪。若不出手，师父就会被抓走。可他再次打下去，也等于让唐僧亲眼看见自己杀死第二个无辜的人。悟空还是挥了棒。妖怪再次留下假尸逃走，唐僧又念紧箍咒，还要赶他离开。']},
{title:'第三次变化',paragraphs:['白骨精第三次变成老翁，说自己出来寻找妻女。她把前两具假尸串成一段完整的家庭悲剧，唐僧听后更加不忍。','悟空叫来山神土地守住四方，不许妖怪再逃。他一棒打下，白骨精现出一堆白骨，脊梁上写着白骨夫人的名字。妖怪终于死了，悟空也拿出了证据。可是唐僧认为，即使那是妖怪，悟空嗜杀的心仍没有改。他写下贬书，执意赶走徒弟。'],original:'那怪物拖着一条粉骷髅，脊梁上有一行字，叫做白骨夫人。'},
{title:'离开以前',paragraphs:['悟空嘴上倔强，真到分别时却放不下师父。他求唐僧接受最后一拜，唐僧不肯。他便拔下毫毛，变出几个自己，从四面一齐下拜。','临走前，悟空嘱咐沙僧，如果师父遇到危险，就来花果山找他。随后他翻上筋斗云。妖怪被除掉了，师徒之间的信任却也被打碎了。']}
],question:'白骨精已经现出原形，唐僧为什么仍然赶走悟空？',options:[{text:'唐僧认为以后再也不会遇到妖怪',why:'唐僧担心的是悟空嗜杀，不是认为以后没有危险。'},{text:'事实真相解决了，行为方式的冲突却没有解决',correct:true,why:'白骨精的身份得到证明，但唐僧仍认为悟空出手太狠。两人的冲突不只是谁真谁假，也在于该怎样行动。'},{text:'悟空主动要求回花果山',why:'悟空多次求情，离开不是他的主动选择。'},{text:'唐僧只相信八戒，从不自己判断',why:'八戒确实挑拨过，唐僧也根据亲眼所见作了判断。'}]},
{no:28,title:'黑松林遇险',focus:'追踪一个决定带来的后果',scenes:[
{title:'两边的路',paragraphs:['悟空回到花果山，赶走欺负群猴的猎户，重新整顿洞府。群猴围着大王欢喜，他也摆出自在模样，可一想到唐僧仍在西行，心里并没有真正放下。','另一边，唐僧带着八戒和沙僧继续赶路。少了悟空探路，三人更加谨慎，却还是在黑松林里陷入饥饿。唐僧让八戒去化斋，等了许久不见回来，又让沙僧去找。']},
{title:'一个人留在林中',paragraphs:['八戒其实走到草地上睡着了。沙僧离开后，唐僧独自坐着，越等越不安。他看见远处有金光，以为那里有寺院，便牵着白马前去。','金光不是寺院，而是波月洞的塔门。唐僧刚走近，就被洞里的小妖捉住。队伍失去辨妖和探路的人，危险便从这个缺口进来了。'],original:'那长老在林间独坐多时，耳热眼跳，身心不安。'},
{title:'百花羞',paragraphs:['洞中还有一位百花羞公主。十三年前，她被黄袍怪从宝象国掳到这里，一直无法回家。她听说唐僧要往西天去，便暗中想办法搭救。','百花羞劝黄袍怪放唐僧离开，又偷偷写下一封家书，请他带给父母。唐僧因此脱险。八戒和沙僧赶到后，只知道师父曾被捉，还不知道这封信会把他们带进更大的风波。']},
{title:'危险没有结束',paragraphs:['三人重新会合，表面上已经离开妖洞，真正的问题却没有解决。百花羞仍被困在波月洞，黄袍怪也没有被降伏。','他们带着书信向宝象国前进。唐僧现在不只是逃出来的人，也成了公主与家乡之间唯一的信使。新的责任已经落在他手里。']}
],question:'唐僧误入波月洞紧接在悟空离队之后，主要有什么作用？',options:[{text:'证明八戒和沙僧完全没有能力',why:'两人仍会救援，“完全没有能力”把一次失误说得过头。'},{text:'说明黄袍怪替白骨精报仇',why:'两只妖怪没有这种关系。'},{text:'让前面的决定迅速显出后果，并推动后续重聚',correct:true,why:'队伍少了最擅长识妖的人，很快遇险。这也为后来请回悟空作了铺垫。'},{text:'用新妖怪结束师徒矛盾',why:'后面的危机恰恰继续发展了师徒分离。'}]},
{no:29,title:'宝象国捎书',focus:'看一封信怎样推动整段故事',scenes:[
{title:'回到故国的消息',paragraphs:['唐僧一行来到宝象国，进宫倒换通关文牒。他拿出百花羞的家书。国王读到女儿还活着，悲喜交加。十三年来，宫中只知道公主失踪，却不知道她被困在哪里。','一封信把波月洞里的秘密带进王宫。国王请求唐僧设法救女儿，八戒和沙僧只得重新回到黑松林。']},
{title:'第一次救援',paragraphs:['八戒和沙僧在洞前叫阵。黄袍怪提刀迎战，三人打得难分难解。百花羞担心父亲派来的人被害，只能在洞中焦急等待。','八戒久战渐渐支撑不住，找借口退走。沙僧独自迎敌，最终被擒。救援没有成功，取经队伍反而又少了一个人。'],original:'公主道：“这是我父王差来的救兵，望大王饶他性命。”'},
{title:'妖怪走进王宫',paragraphs:['黄袍怪得知书信送到宝象国，决定亲自进宫。他变成一个相貌堂堂的男子，自称百花羞的丈夫，还编出一套故事，说唐僧才是伤人的虎精。','外表、身份和叙述都被他安排得十分周全。满朝文武看见的是有礼的驸马，没有人从面貌上认出妖怪。真实和看起来真实，并不是一回事。']},
{title:'局势倒转',paragraphs:['黄袍怪施展法术，把唐僧变成一只斑斓猛虎。众人亲眼见到变化后的模样，立刻相信了妖怪的话。唐僧被关进铁笼，无法开口为自己辩解。','沙僧被困，八戒失散，悟空远在花果山。百花羞的信原本打开了求救之门，也逼得黄袍怪走到台前。故事到了最危险的地方。']}
],question:'百花羞的家书最重要的作用是什么？',options:[{text:'告诉八戒怎样破解法术',why:'信里没有降妖方法。'},{text:'让国王误认唐僧是妖怪',why:'误会来自黄袍怪后来的诬陷。'},{text:'证明百花羞可以自由离开',why:'她仍被控制，所以才秘密求救。'},{text:'连接洞府与王宫，让隐藏的困境变成公开行动',correct:true,why:'国王由此知道女儿活着，救援也因此开始。'}]},
{no:30,title:'邪魔侵正法',focus:'比较人物在危机中的判断',scenes:[
{title:'铁笼里的老虎',paragraphs:['唐僧被变成老虎，只能伏在铁笼里。宫里的人把他当作妖怪，真正的黄袍怪却以驸马身份坐在席上。真假完全颠倒。','八戒回到驿馆，听说师父被关，先想到大家分行李散伙。白龙马听见后，从槽中挣脱出来，决定自己进宫探看。']},
{title:'白龙马夜战',paragraphs:['夜里，白龙马化作宫女，带剑接近黄袍怪。他假装献舞，忽然出手。黄袍怪很快识破，两人在殿中交战。白龙马敌不过他，腿上受伤，只能逃回驿馆。'],original:'那龙马抖擞精神，变做一个宫娥模样，进宫寻那妖魔。'},
{title:'谁才是需要的人',paragraphs:['白龙马受了伤，却没有因为失败赌气。他告诉八戒，眼下只有请回大师兄，才可能救出师父。','黄袍怪不只武力强，还会变化和诬陷。队伍需要的不是再添一个硬拼的人，而是一个既能降妖，又能看破假象的人。八戒虽然不情愿，最终还是往花果山去了。']},
{title:'去请被赶走的人',paragraphs:['八戒越接近花果山，心里越没底。他知道悟空记得贬书，也知道自己当初说过风凉话。现在请悟空回来，就得承认队伍少不了他。','悟空见到八戒，先装作不在意。可他听说唐僧被变成老虎，立刻追问事情经过。嘴上的拒绝和心里的牵挂，同时摆在八戒面前。']}
],question:'白龙马为什么坚持请回悟空？',options:[{text:'悟空排行第一，必须先出手',why:'身份次序不是重点。'},{text:'悟空熟悉宝象国',why:'悟空此前没有来过。'},{text:'既要降妖又要识破变化，正需要悟空的长处',correct:true,why:'黄袍怪靠变化颠倒真假，悟空的眼力和本领都不可替代。'},{text:'让八戒离开，好让白龙马逃走',why:'白龙马是在组织救援。'}]},
{no:31,title:'义激美猴王',focus:'评价一个并不完美的好办法',scenes:[
{title:'软话请不动',paragraphs:['八戒来到水帘洞，说师父有难，请悟空回去。悟空记着被逐的委屈，故意说取经与他无关，还叫小猴赶走八戒。','八戒换着法子求情，悟空仍不答应。不过每当说到唐僧的处境，悟空都会追问细节。八戒看明白，悟空不是不牵挂，只是不愿轻易跨过伤心的门槛。']},
{title:'请将不如激将',paragraphs:['八戒故意说黄袍怪不仅抓了唐僧，还指名辱骂孙悟空，说他不敢来战。悟空明知八戒可能添油加醋，还是提起金箍棒出了洞。','八戒的话不完全诚实，却击中了悟空的骄傲，也给了他一个回去的理由。悟空可以说自己不是向唐僧低头，而是去找妖怪算账。'],original:'八戒思量道：“请将不如激将，等我激他一激。”'},
{title:'找回真相',paragraphs:['悟空来到宝象国，先救出沙僧，又让众人看见笼中虎其实是唐僧。','随后悟空上天查访，才知道黄袍怪原是二十八宿中的奎木狼。天兵将他收回，唐僧恢复原形。靠变化制造的假象，终于一层层被揭开。']},
{title:'重新上路',paragraphs:['唐僧见到悟空，既惭愧又欢喜。悟空没有反复追问谁对谁错，而是重新收拾行李，护着师父上路。','从白虎岭到宝象国，师徒绕了很大一圈，才明白彼此的本领和性情不能简单替代。队伍恢复原样，对信任、判断和求助的认识却已不同。']}
],question:'怎样评价八戒用激将法请回悟空？',options:[{text:'结果好，所以说谎完全没问题',why:'好的结果不会让手段自动变得没有争议。'},{text:'既利用悟空的骄傲，也看准他仍牵挂师父',correct:true,why:'八戒同时懂得悟空好胜的一面和放不下师父的一面。'},{text:'八戒只想看热闹',why:'他的核心目标仍是救师父。'},{text:'悟空完全相信了八戒',why:'悟空知道八戒可能添话。'}]}
];
const feedbackText:Record<Feedback,string>={'有点难':'下一章会把人物关系说得更明白，并在每个场景补足因果。','刚刚好':'下一章保持现在的节奏和解释密度。','想读深一点':'下一章会少给结论，多留证据让你自己判断。'};
export default function Home(){const[index,setIndex]=useState(0);const[feedback,setFeedback]=useState<Feedback|null>(null);const[open,setOpen]=useState<string|null>(null);const[selected,setSelected]=useState<number|null>(null);const[submitted,setSubmitted]=useState(false);const[record,setRecord]=useState({right:0,wrong:0});const chapter=chapters[index];const correct=chapter.options.findIndex(x=>x.correct);const passed=submitted&&selected===correct;
useEffect(()=>{const raw=localStorage.getItem('zhiji-v3');if(raw)try{const s=JSON.parse(raw);setIndex(Math.min(s.index||0,chapters.length-1));setRecord(s.record||{right:0,wrong:0})}catch{}},[]);useEffect(()=>{localStorage.setItem('zhiji-v3',JSON.stringify({index,record}))},[index,record]);
function check(){if(selected===null||submitted)return;setSubmitted(true);setRecord(v=>selected===correct?{...v,right:v.right+1}:{...v,wrong:v.wrong+1})}function move(n:number){if(n<0||n>=chapters.length)return;setIndex(n);setFeedback(null);setOpen(null);setSelected(null);setSubmitted(false);window.scrollTo({top:0,behavior:'smooth'})}
return <main className="app-shell" id="top"><header className="topbar"><a href="#top" className="brand"><span><BookOpen size={18}/></span>知己读书</a><div className="progress"><span>《西游记》试读</span><i><b style={{width:`${(index+1)/chapters.length*100}%`}}/></i><small>{index+1} / {chapters.length}</small></div><div className="agent"><span/>文学编辑已核对本章</div></header>
<nav className="chapter-nav">{chapters.map((x,i)=><button key={x.no} className={i===index?'active':i<index?'read':''} onClick={()=>move(i)}><span>{i<index?<Check size={12}/>:i+1}</span><div><small>第{x.no}回</small><strong>{x.title}</strong></div></button>)}</nav>
<article className="reader"><section className="chapter-head"><p>第 {chapter.no} 回</p><h1>{chapter.title}</h1><div className="focus"><Sparkles size={15}/><span>完整保留事件经过</span><i/>本章阅读重点：{chapter.focus}</div></section>
<div className="step-label"><span>1</span><div><strong>读完整章</strong><small>不是摘要。重要段落旁可以打开原文对照。</small></div></div><div className="story">{chapter.scenes.map((scene,j)=>{const key=`${chapter.no}-${j}`;return <section className="scene" key={key}><div className="scene-number">{String(j+1).padStart(2,'0')}</div><div className="scene-body"><h2>{scene.title}</h2>{scene.paragraphs.map((p,k)=><p key={k}>{p}</p>)}{scene.original&&<><button className="original-button" onClick={()=>setOpen(open===key?null:key)}><BookOpen size={14}/>{open===key?'收起原文':'在这里对照原文'}</button>{open===key&&<blockquote><p>{scene.original}</p><small>原文节选不参与个性化改写</small></blockquote>}</>}</div></section>})}</div>
<section className="after-reading"><div className="step-label"><span>2</span><div><strong>告诉我读感</strong><small>这次反馈会改变下一整章的讲述方式。</small></div></div><div className="feedback-row">{(['有点难','刚刚好','想读深一点'] as Feedback[]).map(x=><button key={x} className={feedback===x?'selected':''} onClick={()=>setFeedback(x)}>{x}</button>)}</div>{feedback&&<p className="learned"><Check size={14}/>{feedbackText[feedback]}</p>}</section>
<section className="quiz"><div className="step-label"><span>3</span><div><strong>用一道题检验理解</strong><small>选项里有对有错。答错后会告诉你错在哪里。</small></div><em>{record.right} 对 · {record.wrong} 错</em></div><h2>{chapter.question}</h2><div className="options">{chapter.options.map((x,i)=>{const state=submitted?x.correct?'correct':selected===i?'wrong':'':selected===i?'selected':'';return <button key={x.text} className={state} onClick={()=>!submitted&&setSelected(i)}><span>{String.fromCharCode(65+i)}</span><p>{x.text}</p>{submitted&&x.correct&&<Check size={17}/>} {submitted&&selected===i&&!x.correct&&<X size={17}/>}</button>})}</div>{!submitted&&<button className="primary" disabled={selected===null} onClick={check}>提交答案</button>}{submitted&&selected!==null&&<div className={`explanation ${passed?'good':'bad'}`}><CircleAlert size={18}/><div><strong>{passed?'答对了':'这个选项不成立'}</strong><p>{chapter.options[selected].why}</p>{!passed&&<button onClick={()=>{setSelected(null);setSubmitted(false)}}><RotateCcw size={13}/>再选一次</button>}</div></div>}</section>
<footer><button disabled={index===0} onClick={()=>move(index-1)}><ChevronLeft/>上一章</button><p>{passed?'理解已记录，可以继续了':'答对后进入下一章'}</p><button disabled={!passed||index===chapters.length-1} onClick={()=>move(index+1)}>下一章<ChevronRight/></button></footer></article></main>}
