/* Shared public-site and admin content model. No credentials or service calls. */
globalThis.TELBrandModel = (() => {
  const defaults = {
    version: 1,
    tel: {
      headline: 'Ideas.', outline: 'Made real.',
      intro: 'Learning worth experiencing. Businesses worth building. We turn curiosity into useful work through TEL Education and TeMark.',
      mission: 'Make meaningful technology and thoughtful ideas easier to understand, experience and use.',
      instagram: 'techforeasylife.in',
      journeyIntro: 'TEL started with a smart-home idea. Each project, prototype and fresh start has shaped the company we are building today.',
      smartHomeVideo: ''
    },
    education: {
      name: 'TEL Education', status: 'coming_soon',
      intro: 'Our first rocket has flown. TEL Education brings model rocket products, practical STEM and the SafeFlight learning system together. Our public launch is coming soon.',
      detail: 'From the model rocket kit to guided preparation through SafeFlight, we are building experiences that make classroom ideas tangible. Our first flight is complete; now we are preparing to share TEL Education with the public.',
      opening: 'Coming soon',
      launchNote: 'First flight complete. Our public opening date will be announced here.',
      flightVideo: 'https://youtu.be/c0egvCz12nI',
      schoolEnquiriesOpen: true,
      schoolYear: '2027'
    },
    temark: {
      name: 'TeMark by TEL', instagram: 'temarkk_',
      email: 'business.telmark@gmail.com', emailVerified: false,
      ctaTitle: 'Become our client today.',
      ctaIntro: 'Tell us about your business, your audience and what you want to achieve. Let’s discuss where TeMark can help.',
      ctaLabel: 'Start a project enquiry',
      intro: 'The creative and marketing venture of TEL. We learn how your business works, then bring strategy, campaigns, content and design together around it.',
      approach: 'Every business has its own customers, location and ambitions. We take time to understand those details, shape a content plan, create the work and keep learning as the business grows.'
    },
    business: {legalName:'', address:'', registration:'', privacyEmail:'techforeasylife.operations@gmail.com', grievanceName:'', grievanceEmail:'', phone:''},
    services: [
      { id:'strategy', title:'Marketing strategy & campaigns', detail:'Business understanding, marketing direction, campaign planning and coordination across the brand’s communication.' },
      { id:'social', title:'Social media management', detail:'Content planning, calendars, publishing and a consistent presence across business accounts.' },
      { id:'content', title:'Reels & content production', detail:'Short-form video, photography, editing and content shaped around the business.' },
      { id:'design', title:'Graphic design & campaigns', detail:'Branded creatives, launch communication, seasonal posts and campaign visuals.' },
      { id:'web', title:'Websites & digital presence', detail:'Clear websites and digital touchpoints that help people understand a business and make enquiries.' },
      { id:'reporting', title:'Performance tracking & reporting', detail:'Following marketing and social performance, reviewing campaign activity and using the findings to shape the next plan.' }
    ],
    clients: [
      {id:'sk-group',name:'SK Group',sector:'Business group',status:'current',visible:true,detail:'We manage overall marketing strategy and coordination for SK Group, including campaign planning, social media, content, branded creatives and performance tracking.',services:['Marketing strategy','Campaign planning','Social media management','Content & design','Performance tracking & reporting']},
      {id:'gs-motors',name:'GS Motors',sector:'Automotive',status:'current',visible:true,detail:'Social media management and creative content that introduce the business, its offerings and its customer experience.',services:['Social media management','Reels & content','Graphic design']},
      {id:'gs-riders',name:'GS Riders',sector:'Automotive',status:'current',visible:true,detail:'Social media management, business-led storytelling and visual content for its online presence.',services:['Social media management','Reels & content','Branded creatives']},
      {id:'osom-motors',name:'OSOM Motors',sector:'Automotive',status:'current',visible:true,detail:'Content planning and social media management, with creatives built around the business and its audience.',services:['Social media management','Content planning','Graphic design']},
      {id:'dental-care',name:'Dental Care, GS Road',sector:'Healthcare',status:'current',visible:true,detail:'Social media content and graphic design that introduce the practice and communicate its services clearly.',services:['Social media content','Graphic design','Digital communication']},
      {id:'sk-resort',name:'Upcoming resort · SK Group',sector:'Hospitality',status:'upcoming',visible:true,detail:'SK Group’s upcoming resort is a future addition to our work. It is shown here as an upcoming engagement.',services:['Planned brand communication','Planned social media presence']}
    ],
    dealershipBrands:['tvs','royal-enfield','montra'],
    upcomingBrands:['yamaha'],
    milestones:[
      {id:'beginnings',year:'2022',title:'A first idea. A habit of building.',detail:'TEL’s first smart-home project begins the journey, with a simple ambition: make useful technology easier to experience.'},
      {id:'first-flight',year:'2023',title:'Try. Learn. Fly.',detail:'Early rocket prototyping brings a setback and then a breakthrough. The first attempt fails; the second flies.'},
      {id:'new-horizons',year:'2024',title:'New horizons. A fresh team.',detail:'TEL reaches Delhi, receives seed support and rebuilds with a new student team.'},
      {id:'rocket-kit',year:'2025',title:'From a prototype to a product.',detail:'The TEL Rocket Kit becomes the flagship learning product, turning the team’s practical experience into a clearer product direction.'},
      {id:'two-ventures',year:'2026',title:'Different paths. One TEL.',detail:'TEL prepares its school learning module and SafeFlight pathway, while TeMark grows its work with businesses across strategy, campaigns, social media and design. TEL Education’s public launch is still ahead.'}
    ]
  };
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const str = (value, fallback='') => typeof value === 'string' ? value.trim() : fallback;
  const clone = value => JSON.parse(JSON.stringify(value));
  const brands = ['tvs','royal-enfield','montra','yamaha','ashok-leyland'];
  const isPublicVideoUrl = value => {
    try {const url=new URL(value);return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password;}catch{return false;}
  };
  const isVideoUrl = value => {
    try {
      const url=new URL(value);
      if(url.protocol!=='https:')return false;
      if(url.hostname==='youtu.be')return /^\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname);
      return ['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)&&url.pathname==='/watch'&&/^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get('v')||'');
    }catch{return false;}
  };
  function normalize(input) {
    const source=object(input);
    const section=(key,keys)=>Object.fromEntries(keys.map(k=>[k,str(object(source[key])[k],defaults[key][k])]));
    return {
      version:1,
      tel:section('tel',['headline','outline','intro','mission','instagram','journeyIntro','smartHomeVideo']),
      education:{...section('education',['name','status','intro','detail','opening','launchNote','flightVideo','schoolYear']),schoolEnquiriesOpen:typeof object(source.education).schoolEnquiriesOpen==='boolean'?source.education.schoolEnquiriesOpen:defaults.education.schoolEnquiriesOpen},
      temark:{...section('temark',['name','instagram','email','intro','approach','ctaTitle','ctaIntro','ctaLabel']),emailVerified:typeof object(source.temark).emailVerified==='boolean'?source.temark.emailVerified:defaults.temark.emailVerified},
      business:section('business',['legalName','address','registration','privacyEmail','grievanceName','grievanceEmail','phone']),
      services:(Array.isArray(source.services)?source.services:defaults.services).map((item,index)=>{const s=object(item);return{id:str(s.id,`service-${index+1}`),title:str(s.title),detail:str(s.detail)};}),
      clients:(Array.isArray(source.clients)?source.clients:defaults.clients).map((item,index)=>{const s=object(item);return{id:str(s.id,`client-${index+1}`),name:str(s.name),sector:str(s.sector),status:str(s.status,'current'),visible:s.visible!==false,detail:str(s.detail),services:Array.isArray(s.services)?s.services.map(v=>str(v)).filter(Boolean):[]};}),
      dealershipBrands:Array.isArray(source.dealershipBrands)?[...new Set(source.dealershipBrands.map(v=>str(v)))]:[...defaults.dealershipBrands],
      upcomingBrands:Array.isArray(source.upcomingBrands)?[...new Set(source.upcomingBrands.map(v=>str(v)))]:[...defaults.upcomingBrands],
      milestones:(Array.isArray(source.milestones)?source.milestones:defaults.milestones).map((item,index)=>{const value=object(item);return{id:str(value.id,`milestone-${index+1}`),year:str(value.year),title:str(value.title),detail:str(value.detail)};})
    };
  }
  function validate(input) {
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('TEL content must be an object.');
    if(input.services!==undefined&&!Array.isArray(input.services))throw new Error('Services must be a list.');
    if(input.clients!==undefined&&!Array.isArray(input.clients))throw new Error('Clients must be a list.');
    if(input.dealershipBrands!==undefined&&!Array.isArray(input.dealershipBrands))throw new Error('Dealership brands must be a list.');
    if(input.upcomingBrands!==undefined&&!Array.isArray(input.upcomingBrands))throw new Error('Upcoming brands must be a list.');
    if(input.milestones!==undefined&&!Array.isArray(input.milestones))throw new Error('Milestones must be a list.');
    const data=normalize(input);
    const text=(value,max,label,required=true)=>{if(required&&!value)throw new Error(`${label} is required.`);if(value.length>max)throw new Error(`${label} is too long.`);};
    text(data.tel.headline,90,'TEL headline');text(data.tel.outline,90,'TEL outline');text(data.tel.intro,600,'TEL introduction');text(data.tel.mission,700,'TEL mission');
    text(data.tel.journeyIntro,500,'Journey introduction');
    text(data.tel.smartHomeVideo,400,'Smart-home video link',false);
    if(data.tel.smartHomeVideo&&!isPublicVideoUrl(data.tel.smartHomeVideo))throw new Error('Enter a valid HTTPS link for the smart-home video.');
    if(!/^[A-Za-z0-9._]{1,30}$/.test(data.tel.instagram))throw new Error('Enter TEL’s Instagram handle without @, spaces or a URL.');
    text(data.education.name,80,'Education name');text(data.education.intro,600,'Education introduction');text(data.education.detail,700,'Education details');
    text(data.education.opening,100,'Public opening');text(data.education.launchNote,300,'Launch update');
    if(input.education?.schoolEnquiriesOpen!==undefined&&typeof input.education.schoolEnquiriesOpen!=='boolean')throw new Error('School enquiry availability must be true or false.');
    if(!/^20\d{2}$/.test(data.education.schoolYear))throw new Error('Enter a four-digit school enquiry year.');
    if(!isVideoUrl(data.education.flightVideo))throw new Error('Enter a valid HTTPS YouTube video link for the first flight.');
    if(!['coming_soon','active'].includes(data.education.status))throw new Error('Choose a valid TEL Education status.');
    text(data.temark.name,80,'TeMark name');text(data.temark.intro,600,'TeMark introduction');text(data.temark.approach,900,'TeMark approach');
    if(!/^[A-Za-z0-9._]{1,30}$/.test(data.temark.instagram))throw new Error('Enter an Instagram handle without @, spaces or a URL.');
    if(input.temark?.emailVerified!==undefined&&typeof input.temark.emailVerified!=='boolean')throw new Error('TeMark email confirmation must be true or false.');
    if(data.temark.email&&!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(data.temark.email))throw new Error('Enter a valid TeMark email address.');
    if(data.temark.emailVerified&&!data.temark.email)throw new Error('Add the confirmed TeMark email address.');
    text(data.temark.email,200,'TeMark email',false);
    text(data.temark.ctaTitle,100,'TeMark call to action');text(data.temark.ctaIntro,350,'TeMark enquiry introduction');text(data.temark.ctaLabel,60,'TeMark enquiry button');
    for(const [key,value]of Object.entries(data.business))text(value,key==='address'?600:200,'Business '+key,false);
    for(const key of ['privacyEmail','grievanceEmail'])if(data.business[key]&&!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(data.business[key]))throw new Error('Enter a valid '+key+' address.');
    if(data.services.length>10)throw new Error('Up to 10 services are allowed.');
    if(data.clients.length>40)throw new Error('Up to 40 client entries are allowed.');
    const ids=new Set();
    for(const [kind,items]of[['Service',data.services],['Client',data.clients]])for(const item of items){
      if(!/^[a-z0-9][a-z0-9-]{1,79}$/.test(item.id))throw new Error(`${kind} has an invalid ID.`);
      const key=kind+':'+item.id;if(ids.has(key))throw new Error(`Duplicate ${kind.toLowerCase()} ID.`);ids.add(key);
      text(item.name??item.title,120,`${kind} name`);text(item.detail,800,`${kind} description`);
      if(kind==='Client'){
        text(item.sector,100,'Client sector');if(!['current','upcoming'].includes(item.status))throw new Error('Choose Current or Upcoming for each client.');
        if(item.services.length>8)throw new Error('Each client can have up to 8 service labels.');for(const service of item.services)text(service,100,'Service label');
      }
    }
    if(data.dealershipBrands.length>brands.length||data.dealershipBrands.some(id=>!brands.includes(id)))throw new Error('Choose a supported dealership brand.');
    if(data.upcomingBrands.length>brands.length||data.upcomingBrands.some(id=>!brands.includes(id)))throw new Error('Choose a supported upcoming brand.');
    if(data.upcomingBrands.some(id=>data.dealershipBrands.includes(id)))throw new Error('A dealership brand must be either current or coming soon.');
    if(data.milestones.length>12)throw new Error('Up to 12 journey milestones are allowed.');
    const milestoneIds=new Set();
    for(const milestone of data.milestones){
      if(!/^[a-z0-9][a-z0-9-]{1,79}$/.test(milestone.id)||milestoneIds.has(milestone.id))throw new Error('Journey milestones need unique valid IDs.');milestoneIds.add(milestone.id);
      text(milestone.year,20,'Milestone year');text(milestone.title,120,'Milestone title');text(milestone.detail,700,'Milestone detail');
    }
    return data;
  }
  return Object.freeze({normalize,validate,isVideoUrl,isPublicVideoUrl,defaults:()=>clone(defaults),brands:Object.freeze([...brands])});
})();
