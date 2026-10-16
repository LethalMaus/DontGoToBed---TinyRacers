import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from './locales.mjs';
import {languages,resolveLanguage,translate} from './i18n.mjs';
test('all eight languages cover every message and preserve placeholders',()=>{
 assert.equal(Object.keys(languages).length,8);
 for(const code of Object.keys(languages)){
  assert.deepEqual(Object.keys(catalog[code]),Object.keys(catalog.en));
  for(const [source,result] of Object.entries(catalog[code])){
   assert.ok(result.trim());assert.deepEqual(result.match(/\{\d+\}/g)?.sort(),source.match(/\{\d+\}/g)?.sort());
   assert.equal(translate(source,code),result);
  }
 }
});
test('region fallback and interpolated race status preserve player data',()=>{
 assert.equal(resolveLanguage('de-DE'),'de');assert.equal(resolveLanguage('pt-BR'),'pt');assert.equal(resolveLanguage('ja-JP'),'en');
 assert.equal(translate('Player 2 paused','de'),'Spieler 2 hat pausiert');
 assert.equal(translate('PLAYER 3 PAUSED','fr'),'Joueur 3 en pause');
 assert.equal(translate('Leo SCORES +1','es'),'Leo GANA +1');
 assert.equal(translate('#2 · Points: 12','pl'),'#2 · Punkty: 12');
 assert.equal(translate('🔨 Toy hammer','de'),'🔨 Spielzeughammer');
 assert.equal(translate('Room code  abcd1234','de'),'Raumcode  abcd1234');
 assert.equal(translate('P1 · Leo','nl'),'P1 · Leo');
 assert.equal(translate('01 \u00a0 Join the race','de'),'01 · Mitfahren');
});
