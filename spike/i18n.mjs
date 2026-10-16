import { catalog } from './locales.mjs';
export const languages={en:'English',de:'Deutsch',fr:'Français',es:'Español',it:'Italiano',pt:'Português',nl:'Nederlands',pl:'Polski'};
export function resolveLanguage(value){const code=String(value??'').toLowerCase().split(/[-_]/)[0];return Object.hasOwn(languages,code)?code:'en';}
const normal=s=>s.replace(/\s+/g,' ').trim();
const keys=new Map(Object.keys(catalog.en).map(key=>[normal(key).toLowerCase(),key]));
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patterns=Object.keys(catalog.en).filter(key=>/\{\d+\}/.test(key)).map(key=>({key,regex:new RegExp('^'+key.split(/\{\d+\}/).map(escape).join('(.+?)')+'$','i')}));
export function translate(source,language='en'){
 const text=String(source),lang=resolveLanguage(language),canonical=keys.get(normal(text).toLowerCase());
 if(canonical)return catalog[lang][canonical];
 for(const {key,regex} of patterns){const match=text.match(regex);if(match)return catalog[lang][key].replace(/\{(\d+)\}/g,(_,n)=>match[Number(n)+1]);}
 // Composed status lines retain room codes, names, numbers and emoji verbatim.
 if(text.includes(' · '))return text.split(' · ').map(part=>translate(part,lang)).join(' · ');
 const item=text.match(/^(\S+) (Boost|Toy ball|Oil slick|Toy hammer|Boxing glove|Grabber stick)$/);
 if(item)return item[1]+' '+translate(item[2],lang);
 return text;
}
