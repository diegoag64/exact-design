import {test,expect} from 'bun:test';
import {parseNumber,formatNumber,evaluate,clampNumber} from './modules/web/number-fields.js';

test('number fields step lengths and keep their unit',()=>{
  expect(parseNumber('16')).toEqual({value:16,unit:''});
  expect(parseNumber(' 1.5rem ')).toEqual({value:1.5,unit:'rem'});
  expect(parseNumber('-8px')).toEqual({value:-8,unit:'px'});
  for(const text of ['auto','8 16','#fff','ember',''])expect(parseNumber(text)).toBeNull();
  expect(formatNumber(0.1+0.2,'rem')).toBe('0.3rem');
});
test('number fields evaluate simple math and refuse anything else',()=>{
  expect(evaluate('16*2')).toBe('32');
  expect(evaluate('(24 - 8) / 2')).toBe('8');
  expect(evaluate('12px + 4')).toBe('16px');
  expect(evaluate('-4 + 10')).toBe('6');
  expect(evaluate('10/3')).toBe('3.33');
  for(const text of ['16','-8','auto','1px + 1rem','2 *','alert(1)','1/0','(1+2'])expect(evaluate(text)).toBeNull();
});

test('arrow steps and scrubs clamp only fields with an explicit minimum',()=>{
  for(const min of [undefined,''])expect(clampNumber(-9,min)).toBe(-9);
  expect(clampNumber(-9,'0')).toBe(0);
  expect(clampNumber(0.5,'0')).toBe(0.5);
  expect(clampNumber(-9,'-10')).toBe(-9);
});
