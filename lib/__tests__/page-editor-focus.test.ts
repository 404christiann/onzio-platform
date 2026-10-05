import { describe, expect, it, vi } from "vitest";
import { capturePageEditorFocus, markPageEditorFocusTarget } from "../page-editor-focus";
// Narrow DOM facades let these checks exercise target identity/replacement;
// real dialog and browser focus remain covered by the unchanged phone suite.
function element(tagName:string,attrs:Record<string,string>={}) {
 return {tagName,isConnected:true,ownerDocument:null as unknown as Document,
 getAttribute:(key:string)=>attrs[key]??null,setAttribute:(key:string,value:string)=>{attrs[key]=value;},removeAttribute:(key:string)=>{delete attrs[key];},focus:vi.fn()};
}
function document(nodes:ReturnType<typeof element>[]=[]){
 const body=element("BODY");const owner={activeElement:body,nodes,
 querySelectorAll(selector:string){return this.nodes.filter(node=>selector==="iframe"?node.tagName==="IFRAME":node.getAttribute(selector.slice(1,-1))!==null);},
 querySelector(selector:string){return this.querySelectorAll(selector)[0]??null;}};
 body.ownerDocument=owner as unknown as Document;nodes.forEach(node=>{node.ownerDocument=owner as unknown as Document;});return owner;
}
function iframe(child:ReturnType<typeof document>){const frame=Object.assign(element("IFRAME"),{contentDocument:child as unknown as Document});const root=document([frame]);root.activeElement=frame;return {frame,root};}
describe("page editor focus restoration",()=>{
 it("retains a marked iframe selection after decoration blurred it to body",()=>{
  const target=element("SECTION",{"data-program-editor-section":"Program hero"});const child=document([target]);const {root}=iframe(child);
  markPageEditorFocusTarget(target as unknown as HTMLElement);target.focus.mockClear();child.activeElement=element("BODY");
  const restore=capturePageEditorFocus(root as unknown as Document);restore();expect(target.focus).toHaveBeenCalledWith({preventScroll:true});
 });
 it("focuses the replacement section instead of its disconnected previous node",()=>{
  const previous=element("SECTION",{"data-program-editor-section":"Program hero","data-page-editor-focus-target":"true"});const child=document([previous]);child.activeElement=previous;const {root}=iframe(child);
  const restore=capturePageEditorFocus(root as unknown as Document);previous.isConnected=false;
  const replacement=element("SECTION",{"data-program-editor-section":"Program hero"});replacement.ownerDocument=child as unknown as Document;child.nodes=[replacement];restore();
  expect(replacement.focus).toHaveBeenCalledWith({preventScroll:true});expect(previous.focus).not.toHaveBeenCalled();
 });
 it("uses the stable Tryouts target when event labels repeat",()=>{
  const previous=element("BUTTON",{"data-tryouts-editor-target":"event:two","aria-label":"Edit evaluation"});const child=document([previous]);child.activeElement=previous;const {root}=iframe(child);const restore=capturePageEditorFocus(root as unknown as Document);
  previous.isConnected=false;const first=element("BUTTON",{"data-tryouts-editor-target":"event:one","aria-label":"Edit evaluation"}),second=element("BUTTON",{"data-tryouts-editor-target":"event:two","aria-label":"Edit evaluation"});child.nodes=[first,second];restore();
  expect(second.focus).toHaveBeenCalledOnce();expect(first.focus).not.toHaveBeenCalled();
 });
 it("does not focus a detached iframe after navigation",()=>{
  const target=element("BUTTON",{"aria-label":"Edit introduction"});const child=document([target]);child.activeElement=target;const {root,frame}=iframe(child);const restore=capturePageEditorFocus(root as unknown as Document);frame.isConnected=false;restore();expect(target.focus).not.toHaveBeenCalled();
 });
 it("marks only the latest preview selection and preserves a normal outer trigger",()=>{
  const first=element("BUTTON",{"data-page-editor-focus-target":"true"}),second=element("BUTTON");document([first,second]);markPageEditorFocusTarget(second as unknown as HTMLElement);
  expect(first.getAttribute("data-page-editor-focus-target")).toBeNull();expect(second.getAttribute("data-page-editor-focus-target")).toBe("true");
  const outer=document([second]);outer.activeElement=second;second.focus.mockClear();capturePageEditorFocus(outer as unknown as Document)();expect(second.focus).toHaveBeenCalledOnce();
 });
});
