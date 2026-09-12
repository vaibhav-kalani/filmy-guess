import {useEffect,useMemo,useRef,useState} from 'react'
import {movies} from './movies'

const V=new Set(['A','E','I','O','U'])
const C='BCDFGHJKLMNPQRSTVWXYZ'.split('')
const N=9

type R={id:number;title:string;score:number;solved:boolean;skipped?:boolean}

function ids(){
  let p=[...movies],a:number[]=[]
  while(a.length<5){
    let i=Math.floor(Math.random()*p.length)
    a.push(p[i].id)
    p.splice(i,1)
  }
  return a
}

function decode(x:string|null){
  if(!x)return null
  let a=x.split('-').map(Number)
  return a.length===5&&a.every(i=>movies.some(m=>m.id===i))?a:null
}

function win(t:string,g:Set<string>){
  return [...t].every(c=>!/[A-Za-z]/.test(c)||V.has(c.toUpperCase())||g.has(c.toUpperCase()))
}

function achievement(total:number){
  if(total===45)return {name:'BOLLYWOOD LEGEND',emoji:'🏆',level:'legend'}
  if(total>=40)return {name:'SUPERSTAR',emoji:'👑',level:'superstar'}
  if(total>=30)return {name:'LEADING STAR',emoji:'🎥',level:'leading'}
  if(total>=20)return {name:'SUPPORTING STAR',emoji:'🌟',level:'supporting'}
  if(total>=10)return {name:'UP-AND-COMER',emoji:'⭐',level:'upcoming'}
  return {name:'AUDITIONING',emoji:'🎬',level:'audition'}
}

function tone(ctx:AudioContext,f:number,d:number,type:OscillatorType='sine',v=.045){
  const o=ctx.createOscillator(),g=ctx.createGain()
  o.type=type;o.frequency.value=f;g.gain.setValueAtTime(v,ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+d)
  o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+d)
}

export function App(){
  const challenge=useMemo(()=>decode(new URLSearchParams(location.search).get('challenge')),[])
  const [sound,setSound]=useState(()=>localStorage.getItem('filmyGuessSound')!=='off')
  const audio=useRef<AudioContext|null>(null)
  const [game,setGame]=useState({
    movieIds:challenge??ids(),round:0,guessed:[] as string[],wrong:0,results:[] as R[],done:false
  })
  const [copied,setCopied]=useState('')
  const movie=movies.find(m=>m.id===game.movieIds[game.round])!
  const guessed=new Set(game.guessed)
  const score=Math.max(0,N-game.wrong)
  const solved=win(movie.title,guessed)
  const lost=!solved&&game.wrong>=N
  const total=game.results.reduce((s,r)=>s+r.score,0)

  function toggleSound(){
    const next=!sound
    setSound(next)
    localStorage.setItem('filmyGuessSound',next?'on':'off')
    if(next)play('click')
  }

  function play(kind:'click'|'good'|'bad'|'skip'|'win'|'finish'){
    if(!sound)return
    try{
      if(!audio.current)audio.current=new AudioContext()
      const ctx=audio.current
      if(ctx.state==='suspended')ctx.resume()
      if(kind==='click')tone(ctx,520,.07,'sine',.035)
      if(kind==='good'){tone(ctx,660,.09,'triangle',.04);setTimeout(()=>tone(ctx,880,.12,'triangle',.035),65)}
      if(kind==='bad'){tone(ctx,180,.16,'sawtooth',.035)}
      if(kind==='skip'){tone(ctx,300,.08,'sine',.03);setTimeout(()=>tone(ctx,220,.12,'sine',.025),70)}
      if(kind==='win'){tone(ctx,660,.12,'triangle',.04);setTimeout(()=>tone(ctx,880,.12,'triangle',.04),100);setTimeout(()=>tone(ctx,1040,.18,'triangle',.045),200)}
      if(kind==='finish'){[523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(ctx,f,.22,'triangle',.045),i*110))}
    }catch{}
  }

  useEffect(()=>{
    if(game.done||(!solved&&!lost))return
    play(solved?'win':'bad')
    const t=setTimeout(()=>{
      setGame(g=>{
        const r={id:movie.id,title:movie.title,score:solved?score:0,solved}
        const results=[...g.results,r]
        return g.round===4?{...g,results,done:true}:{...g,results,round:g.round+1,guessed:[],wrong:0}
      })
    },solved?800:1200)
    return()=>clearTimeout(t)
  },[solved,lost,game.done,movie.id,movie.title,score])

  useEffect(()=>{
    if(game.done)play('finish')
  },[game.done])

  function pick(l:string){
    if(solved||lost||game.guessed.includes(l))return
    play(movie.title.toUpperCase().includes(l)?'good':'bad')
    setGame(g=>({...g,guessed:[...g.guessed,l],wrong:g.wrong+(movie.title.toUpperCase().includes(l)?0:1)}))
  }

  function skip(){
    if(solved||lost)return
    play('skip')
    setGame(g=>{
      const r={id:movie.id,title:movie.title,score:0,solved:false,skipped:true}
      const results=[...g.results,r]
      return g.round===4?{...g,results,done:true}:{...g,results,round:g.round+1,guessed:[],wrong:0}
    })
  }

  function restart(){
    history.replaceState({},'',location.pathname)
    setGame({movieIds:ids(),round:0,guessed:[],wrong:0,results:[],done:false})
    setCopied('')
  }

  async function copyOrShare(text:string,title:string,message:string){
    try{
      if(navigator.share)await navigator.share({title,text})
      else{await navigator.clipboard.writeText(text);setCopied(message);setTimeout(()=>setCopied(''),1800)}
    }catch{}
  }

  async function challengeFriend(){
    const url=`${location.origin}${location.pathname}?challenge=${game.movieIds.join('-')}`
    await copyOrShare(`🎬 I scored ${total}/45 on FILMY GUESS!\nTHINK YOU CAN BEAT ME?\n${url}`,'FILMY GUESS — CHALLENGE','CHALLENGE COPIED!')
  }

  async function shareResult(){
    const a=achievement(total)
    const squares=game.results.map(r=>r.skipped?'⬜':r.solved?(r.score>=7?'🟩':r.score>=4?'🟨':'🟧'):'🟥').join('')
    await copyOrShare(`🎬 FILMY GUESS\n${total}/45 — ${a.name}\n${squares}\n${game.results.filter(r=>r.solved).length}/5 MOVIES GUESSED`,'FILMY GUESS — RESULT','RESULT COPIED!')
  }

  if(game.done){
    const a=achievement(total)
    return <main>
      <section className="shell results">
        <div className="logo">FILMY <b>GUESS</b></div>
        <div className={`hero achievement-hero ${a.level}`}>
          <div className="burst">✦ ✦ ✦</div>
          <div className="achievement-emoji">{a.emoji}</div>
          <h1>THAT'S A WRAP!</h1>
          <p>FIVE MOVIES. ONE FINAL TALLY.</p>
        </div>
        <div className="card score">
          <strong>{total}<small>/45</small></strong>
          <label>TOTAL SCORE</label>
          <div className="achievement">
            <span>{a.emoji}</span><div><small>YOUR ACHIEVEMENT</small><b>{a.name}</b></div>
          </div>
          <div className="results-list">
            {game.results.map((r,i)=><div className="row" key={i}><span>{r.title.toUpperCase()}</span><b>{r.skipped?'SKIPPED':r.solved?r.score:'MISS'}</b></div>)}
          </div>
          <div className="sq">{game.results.map((r,i)=><span key={i}>{r.skipped?'⬜':r.solved?(r.score>=7?'🟩':r.score>=4?'🟨':'🟧'):'🟥'}</span>)}</div>
          <p>{game.results.filter(r=>r.solved).length}/5 MOVIES GUESSED</p>
        </div>
        <div className="actions">
          <button className="primary" onClick={challengeFriend}>↗ {copied==='CHALLENGE COPIED!'?'CHALLENGE COPIED!':'CHALLENGE A FRIEND'}</button>
          <button onClick={shareResult}>↗ {copied==='RESULT COPIED!'?'RESULT COPIED!':'SHARE RESULT'}</button>
          <button onClick={restart}>PLAY AGAIN</button>
        </div>
      </section>
    </main>
  }

  return <main>
    <section className="shell">
      <header>
        <div className="logo">FILMY <b>GUESS</b></div>
        <div className="header-actions"><button className="sound" onClick={toggleSound} aria-label="Toggle sound">{sound?'🔊':'🔇'}</button><div className="pill">MOVIE {game.round+1} / 5</div></div>
      </header>
      <div className="progress"><i style={{width:`${game.round*25}%`}}/></div>
      <section className="card game">
        <div className="top"><span>GUESS THE BOLLYWOOD MOVIE</span><b>★ {score}</b></div>
        <div className="bollywood">{'BOLLYWOOD'.split('').map((x,i)=><span className={i>=score?'cut':''} key={i}>{x}</span>)}</div>
        <div className="title">
          {movie.title.toUpperCase().split(/\s+/).map((word,wi)=><span className="word" key={wi}>{[...word].map((c,i)=>/[A-Z]/.test(c)?<span key={i}>{V.has(c)||guessed.has(c)?c:<em>_</em>}</span>:<span className="punct" key={i}>{c}</span>)}</span>)}
        </div>
        <p className="hint">{solved?'🎉 NAILED IT!':lost?`THE MOVIE WAS ${movie.title.toUpperCase()}`:'VOWELS ARE FREE. PICK A CONSONANT.'}</p>
        <div className="keys">{C.map(l=><button key={l} disabled={game.guessed.includes(l)||solved||lost} className={game.guessed.includes(l)?(movie.title.toUpperCase().includes(l)?'good':'bad'):''} onClick={()=>pick(l)}>{l}</button>)}</div>
        <button className="skip" onClick={skip} disabled={solved||lost}>SKIP MOVIE →</button>
      </section>
      <div className="rule">🎬 <span><b>9 CHANCES.</b> EVERY WRONG CONSONANT CROSSES OUT ONE LETTER OF BOLLYWOOD.</span></div>
      <footer><button onClick={restart}>↻ NEW GAME</button><span>BEST OF 5</span></footer>
    </section>
  </main>
}
