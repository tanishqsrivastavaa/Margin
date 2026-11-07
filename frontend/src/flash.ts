import { Extension, Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const key = new PluginKey<DecorationSet>('flash')
let seq = 0

export const Flash = Extension.create({
  name: 'flash',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            set = set.map(tr.mapping, tr.doc)
            const meta = tr.getMeta(key)
            if (meta?.add) set = set.add(tr.doc, [Decoration.inline(meta.add.from, meta.add.to, { class: meta.add.cls }, { id: meta.add.id })])
            if (meta?.remove) set = set.remove(set.find(undefined, undefined, (spec) => spec.id === meta.remove))
            return set
          },
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ]
  },
})

export function flash(editor: Editor, from: number, to: number, cls: string, ms: number) {
  if (to <= from) return
  const id = ++seq
  editor.view.dispatch(editor.state.tr.setMeta(key, { add: { from, to, cls, id } }))
  setTimeout(() => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(key, { remove: id }))
  }, ms)
}
