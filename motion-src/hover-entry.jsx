import { Component, useEffect, useId, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import MicroSlats from './MicroSlats.jsx';
import FluxLines from './FluxLines.jsx';
import ShapeWaves from './ShapeWaves.jsx';
import LogoLoop from './LogoLoop.jsx';
import ElectricLogo from './ElectricLogo.jsx';

const prefersStill=()=>document.body.classList.contains('tel-space-paused')||matchMedia('(prefers-reduced-motion: reduce)').matches;
function useMotion(){
 const [paused,setPaused]=useState(prefersStill);
 useEffect(()=>{
  const query=matchMedia('(prefers-reduced-motion: reduce)');
  const update=()=>setPaused(prefersStill());
  document.addEventListener('tel-motion-change',update);query.addEventListener('change',update);
  return()=>{document.removeEventListener('tel-motion-change',update);query.removeEventListener('change',update);};
 },[]);
 return paused;
}
class VisualBoundary extends Component{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?null:this.props.children;}
}
function Visual({kind,warm=false}){
 const paused=useMotion();
 const [failed,setFailed]=useState(false);
 if(failed)return null;
 if(kind==='slats')return <MicroSlats preset="swell" color={warm?'#b3957e':'#9d83c6'} glintColor={warm?'#f3e5d9':'#efe3ff'} backgroundColor="#100e16"
  slatWidth={9} slatHeight={22} gap={3} speed={.24} glint={.45} fog={.8} interactive={!paused}
  cursorStrength={.8} cursorSize={40} trail={.7} swirl={.2} introDuration={2.4} paused={paused}/>;
 if(kind==='waves')return <ShapeWaves text="" fontFamily='Sora, "Space Grotesk", sans-serif' fontWeight={500}
  textSize={.2} shapes="mixed" cellSize={14} dotSize={.6} color="#b3a4c5" hoverColor="#e4d8ef"
  backgroundColor="#100e16" speed={.3} scale={1} contrast={.7} brightness={.16} flow={0} direction={0}
  fade={.4} interactive={!paused} splashRadius={28} splashStrength={.2} glow={.16} intro
  introDuration={2.1} paused={paused} onError={()=>setFailed(true)}/>;
 return <FluxLines colors={warm?['#d8b89b','#967e6e','#efe0d0']:['#ccb4e7','#8c75b1','#e5d5f4']} speed={.18} scale={1.7} turbulence={.35}
  fluidity={.15} shimmer={.4} glow={.75} lineWidth={.65} flowDirection="up" opacity={.45}
  mouseInteraction={!paused} mouseStrength={.5} mouseRadius={.3} clickSwirl={false} paused={paused}
  transparent backgroundColor="#100d17" dpr={1.5}/>;
}
const names={'tvs':'TVS','royal-enfield':'Royal Enfield','montra':'Montra Electric','yamaha':'Yamaha','ashok-leyland':'Ashok Leyland'};
function BrandMark({src,name}){
 const id=useId().replaceAll(':','');
 // A luminance mask removes the supplied white canvas in the browser. Source art is unchanged.
 return <svg className="tel-loop-brand-mark" viewBox="0 0 200 82" role="img" aria-label={name}>
  <defs><filter id={'invert-'+id}><feColorMatrix type="matrix" values="-0.2126 -0.7152 -0.0722 0 1 -0.2126 -0.7152 -0.0722 0 1 -0.2126 -0.7152 -0.0722 0 1 0 0 0 1 0"/></filter>
   <mask id={'mask-'+id} x="0" y="0" width="200" height="82" maskUnits="userSpaceOnUse" style={{maskType:'luminance'}}><image href={src} width="200" height="82" preserveAspectRatio="xMidYMid meet" filter={'url(#invert-'+id+')'}/></mask></defs>
  <rect width="200" height="82" fill="currentColor" mask={'url(#mask-'+id+')'}/></svg>;
}
function BrandLoop({sources}){
 const paused=useMotion();
 const [config,setConfig]=useState(()=>globalThis.TELBrandConfig||globalThis.TELBrandModel?.defaults());
 useEffect(()=>{const fn=event=>setConfig(event.detail);document.addEventListener('tel-brand-rendered',fn);return()=>document.removeEventListener('tel-brand-rendered',fn);},[]);
 const current=new Set(config?.dealershipBrands||[]);
 const priority=['royal-enfield','yamaha','tvs','montra','ashok-leyland'];
 const entries=[...new Set([...(config?.dealershipBrands||[]),...(config?.upcomingBrands||[])])].sort((a,b)=>priority.indexOf(a)-priority.indexOf(b));
 const logos=entries.filter(id=>sources[id]).map(id=>({title:names[id],node:<span className="tel-loop-brand-entry"><BrandMark src={sources[id]} name={names[id]}/>{current.has(id)?<span className="tel-loop-brand-status" aria-hidden="true"/>:<small className="tel-loop-brand-status">Coming soon</small>}</span>}));
 if(!logos.length)return null;
 return <LogoLoop logos={logos} speed={paused?0:25} direction="right" logoHeight={51} gap={72} hoverSpeed={0}
  fadeOut fadeOutWidth={.055} intro={false} draggable={false} ariaLabel="Dealership brands and upcoming additions" className="tel-brand-logo-loop"/>;
}
function ClientLoop(){
 const paused=useMotion();
 const [config,setConfig]=useState(()=>globalThis.TELBrandConfig||globalThis.TELBrandModel?.defaults());
 useEffect(()=>{const fn=event=>setConfig(event.detail);document.addEventListener('tel-brand-rendered',fn);return()=>document.removeEventListener('tel-brand-rendered',fn);},[]);
 const logos=useMemo(()=>(config?.clients||[]).filter(client=>client.visible&&client.status==='current').map(client=>({
  title:client.name,node:<span className="tel-client-wordmark"><strong>{client.name}</strong><small>{client.sector}</small></span>
 })),[config]);
 if(!logos.length)return null;
 return <LogoLoop logos={logos} speed={paused?0:32} direction="left" layout="line" logoHeight={26} gap={64}
  hoverSpeed={0} scaleOnHover fadeOut fadeOutWidth={.055} intro={false} draggable={false}
  ariaLabel="Current TeMark clients" className="tel-client-logo-loop"/>;
}
globalThis.TELMotionVendor={Lenis,
 mountLoader(host,src){const root=createRoot(host);root.render(<VisualBoundary><ElectricLogo src={src} color="#f4eafa" glowColor="#bca1d8" scale={.74} intensity={.8} glow={.75} thickness={1.35} strands={3} bend={.35} crackle={.6} arcs={.15} flicker={.1} fill={.15} speed={1} interactive={false} onRender={(canvas,presence)=>{if(presence>.2)host.dataset.electricReady='true';}}/></VisualBoundary>);return()=>{root.unmount();delete host.dataset.electricReady;};},
 mountVisual(host,kind){const root=createRoot(host);const warm=document.body.dataset.page==='temark'||Boolean(host.closest('.tel-contact-art-temark'));root.render(<VisualBoundary><Visual kind={kind} warm={warm}/></VisualBoundary>);host.dataset.motionMounted=kind;return()=>root.unmount();},
 mountClients(host){const root=createRoot(host);root.render(<ClientLoop/>);host.dataset.motionMounted='clients';return()=>root.unmount();},
 mountBrands(host){const sources={};document.querySelectorAll('[data-dealership-brand]').forEach(img=>sources[img.dataset.dealershipBrand]=img.currentSrc||img.src);host.removeAttribute('data-dealership-brand-grid');const root=createRoot(host);root.render(<VisualBoundary><BrandLoop sources={sources}/></VisualBoundary>);host.dataset.motionMounted='brands';return()=>root.unmount();}
};
