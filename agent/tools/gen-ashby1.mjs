// Round 1: goto + resume + text fills + plan probe. Usage: node gen-ashby1.mjs <url>
import fs from 'fs';
const W = process.env.AGENT_WORK_DIR;
const url = process.argv[2];
const A = [];
A.push({ do: 'goto', url });
A.push({ do: 'wait', ms: 6000 });
A.push({ do: 'upload', sel: 'input[id=_systemfield_resume], input[type=file]', path: W + '/Hui_Mao_Backend_Software_Engineer.pdf' });
A.push({ do: 'wait', ms: 7000 });
A.push({ do: 'evalJs', code: `(function(){var n=document.getElementById('_systemfield_name');var e=document.getElementById('_systemfield_email');return 'PRE name='+(n?JSON.stringify(n.value):'none')+' email='+(e?JSON.stringify(e.value):'none')})()` });
A.push({ do: 'evalJs', code: `(function(){['_systemfield_name','_systemfield_email'].forEach(function(id){var el=document.getElementById(id);if(el&&el.value){Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}))}});var t=document.querySelector('input[type=tel]');if(t&&t.value){Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(t,'');t.dispatchEvent(new Event('input',{bubbles:true}));}if(t)t.id=t.id||'telfield';return 'cleared'})()` });
A.push({ do: 'typeSlow', sel: 'input[id=_systemfield_name]', value: 'Hui Mao' });
A.push({ do: 'typeSlow', sel: 'input[id=_systemfield_email]', value: 'huiluckylucky@gmail.com' });
A.push({ do: 'evalJs', code: `(function(){var t=document.querySelector('input[type=tel]');return t?'tel:'+t.id:'no tel'})()` });
A.push({ do: 'evalJs', code: `(function(){
var set=function(el,val){var proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement:window.HTMLInputElement;Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}))};
var lblOf=function(e){var l=(e.labels&&e.labels[0])||e.closest('div,fieldset')&&e.closest('div,fieldset').querySelector('label');return ((l&&l.textContent)||e.getAttribute('aria-label')||'').trim()};
var fills=[[/^name$|full name/i,'Hui Mao'],[/^email/i,'huiluckylucky@gmail.com'],[/^phone|mobile phone/i,'2812507589'],[/linkedin/i,'https://www.linkedin.com/in/belindamao'],[/github|portfolio|^website/i,'https://github.com/nonameisready'],[/most recent company|current company|current employer/i,'Bank of America (via Innova Solutions)'],[/zip code/i,'07306'],[/compensation|salary/i,'$150,000+ base (negotiable)'],[/current job title|current title/i,'Senior Software Engineer'],[/years of experience/i,'7']];
var done=[];var fillPlan=[];var fn=0;
[].slice.call(document.querySelectorAll('input[type=text],input[type=email],input[type=tel],input[type=url],textarea')).forEach(function(e){if(!e.offsetParent||e.value)return;var lb=lblOf(e);for(var i=0;i<fills.length;i++){if(fills[i][0].test(lb)){if(!e.id)e.id='ff'+(fn++);fillPlan.push({id:e.id,val:fills[i][1]});done.push(lb.slice(0,25));fills.splice(i,1);return}}});
var loc=null;var ll=[].slice.call(document.querySelectorAll('label')).filter(function(x){return /^location/i.test(x.textContent.trim())})[0];
if(ll){var f=ll.closest('div');var li=(f&&f.querySelector('input'))||(ll.parentElement.parentElement&&ll.parentElement.parentElement.querySelector('input'));if(li&&!li.value){li.id=li.id||'locfield';loc=li.id}}
var YES=[/legally authorized to work/i,/require.*sponsorship/i,/may agree to sponsor/i,/now or in the future require/i,/18 years|age of 18/i,/consent to be recorded/i];
var NO=[/previously (worked|been employed)/i,/have you (ever )?worked (at|for)/i,/current or former employee/i];
var yesIds=[],noIds=[],unknown=[],pre=[];var n=0;
[].slice.call(document.querySelectorAll('[class*=fieldEntry]')).forEach(function(fd){var b=fd.querySelector('button[data-option]');if(!b)return;var lb=((fd.querySelector('label,legend')||{}).textContent||'').trim();var pressed=fd.querySelector('button[aria-pressed=true]');if(pressed){pre.push(lb.slice(0,30));return}var y=fd.querySelector('button[data-option=yes]'),no=fd.querySelector('button[data-option=no]');
if(YES.some(function(r){return r.test(lb)})&&y){y.id=y.id||('yn_yes_'+(n++));yesIds.push(y.id)}
else if(NO.some(function(r){return r.test(lb)})&&no){no.id=no.id||('yn_no_'+(n++));noIds.push(no.id)}
else unknown.push(lb.slice(0,80))});
var vetDecl=[];
[].slice.call(document.querySelectorAll('label')).forEach(function(l){var t=l.textContent.trim();if(/^I am not a protected veteran$|^Decline to self-identify$|^I do ?n.t wish to answer/i.test(t)){var i=l.querySelector('input')||document.getElementById(l.htmlFor);if(i&&!i.checked){i.click();vetDecl.push(t.slice(0,20))}}});
var req=[];[].slice.call(document.querySelectorAll('input,textarea,select')).forEach(function(e){if(e.type==='file'||e.type==='hidden'||!e.offsetParent)return;if(!(e.required||e.getAttribute('aria-required')==='true'))return;if(e.value||e.checked)return;req.push(lblOf(e).slice(0,60)||e.name)});
var radioGroups=[];var rgSeen=new Set();var rn=0;
[].slice.call(document.querySelectorAll('fieldset[class*=radio-group], [class*=radio-group]')).forEach(function(fd){var rads=[].slice.call(fd.querySelectorAll('input[type=radio]'));if(!rads.length)return;var q=((fd.querySelector('label,legend')||{}).textContent||'').trim().slice(0,90);if(rgSeen.has(q))return;rgSeen.add(q);if(rads.some(function(r){return r.checked}))return;if(/gender|race|veteran|disability|hispanic|ethnic/i.test(q))return;var opts=rads.map(function(r){r.id=r.id||('rg'+(rn++));var ol=((r.labels&&r.labels[0]&&r.labels[0].textContent)||(r.closest('[class*=option]')||{}).textContent||'').trim().slice(0,50);return {id:r.id,label:ol}});radioGroups.push({q:q,opts:opts})});
return JSON.stringify({fillPlan:fillPlan,done:done,loc:loc,yesIds:yesIds,noIds:noIds,unknown:unknown,pre:pre,vetDecl:vetDecl,req:req.slice(0,10),radioGroups:radioGroups})})()` });
const out = JSON.stringify({ actions: A });
JSON.parse(out);
fs.writeFileSync(W + '/wd-cmd.json', out);
console.log('ashby r1 written for ' + url.slice(25, 60));
