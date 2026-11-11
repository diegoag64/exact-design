import { test, expect } from 'bun:test';
import { Editor, initial, hitTest, validate, exportContract } from './model';
test('topmost layer wins hit testing', () => { expect(hitTest(initial(), 90, 230)).toBe('card-title'); expect(hitTest(initial(), -1, -1)).toBe(''); });
test('a move is one undo step and a new edit clears redo', () => {
 const e=new Editor(); e.selected='title'; e.move(40,20); expect(e.document.layers[0].x).toBe(96); e.undo(); expect(e.document.layers[0].x).toBe(56); e.property('text','Updated'); expect(e.future.length).toBe(0);
});
test('invalid geometry and colors do not corrupt the document', () => {
 const e=new Editor(); e.selected='title'; e.property('width','-100'); expect(e.document.layers[0].width).toBe(1); e.property('x','NaN'); expect(e.document.layers[0].x).toBe(56); e.property('fill','red'); expect(e.document.layers[0].fill).toBe('#202124');
});
test('export escapes text and keeps real button elements', () => {
 const e=new Editor(); e.selected='title'; e.property('text','Say "hello"\nAgain'); const code=exportContract(e.document); expect(code).toContain('Say \\"hello\\"\\nAgain'); expect(code).toContain('button position='); expect(code).not.toContain('press=');
});
test('document validation rejects duplicate ids', () => { const d=initial(); d.layers.push(d.layers[0]); expect(()=>validate(d)).toThrow(); });
test('new ids cannot collide with reopened documents', () => { const e=new Editor(); e.add('button'); const reopened=new Editor(); reopened.document=validate(e.document); reopened.add('text'); expect(new Set(reopened.document.layers.map(n=>n.id)).size).toBe(8); });
