import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dimensions,integerInput,settingsFrom,DEFAULTS,savings,filename,shortcutURL} from '../js/utils.js';
test('long edge preserves portrait, landscape, square and panorama ratios without upscaling',() => {
  assert.deepEqual(dimensions(3024,4032,1600),{width:1200,height:1600});
  assert.deepEqual(dimensions(4032,3024,1600),{width:1600,height:1200});
  assert.deepEqual(dimensions(4000,4000,1234),{width:1234,height:1234});
  assert.deepEqual(dimensions(20000,1000,1600),{width:1600,height:80});
  assert.deepEqual(dimensions(1,10000,1),{width:1,height:1});
  assert.deepEqual(dimensions(400,300,1600),{width:400,height:300});
  assert.deepEqual(dimensions(3024,4032,0),{width:3024,height:4032});
  assert.throws(() => dimensions(0,4032,1600));
});
test('custom reduction accepts 0–99 integers and rejects incomplete or misleading input',() => {
  for (const [raw,value] of [['0',0],['40',40],[' 73 ',73],['99',99]]) assert.equal(integerInput(raw,0,99),value);
  for (const raw of ['','-1','100','40%','2e1','3.5','NaN','Infinity']) assert.equal(integerInput(raw,0,99),null);
  assert.equal(integerInput('100000',1,100000),100000);
  assert.equal(integerInput('0',1,100000),null);
});
test('corrupt settings safely restore defaults; permitted user settings survive',() => {
  for (const value of [null,[], 'bad', {longEdge:-1,reduction:100,format:'heic',theme:'blue'}]) assert.deepEqual(settingsFrom(value),DEFAULTS);
  assert.deepEqual(settingsFrom({longEdge:0,reduction:73,format:'webp',theme:'dark',shortcutName:' Sếp 👋 '}),{longEdge:0,reduction:73,format:'webp',theme:'dark',shortcutName:'Sếp 👋'});
});
test('reported savings are measured bytes, file names safe and Shortcut URLs use clipboard',() => {
  assert.equal(savings(3500000,2100000),40); assert.equal(savings(1000,1500),-50);
  assert.equal(filename('a/b:ảnh.jpeg','webp',2),'a_b_ảnh-gon-2.webp');
  const url = new URL(shortcutURL('Sếp & + # 👋')); assert.equal(url.searchParams.get('name'),'Sếp & + # 👋'); assert.equal(url.searchParams.get('input'),'clipboard'); assert.equal(url.searchParams.has('text'),false);
  assert.throws(() => shortcutURL(' '));
});
