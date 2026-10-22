// Persona Mask — browser half.
//
// Registers one first-level settings page ("人格面具") in `settings.section`.
// The page talks to the Host half over two same-origin routes:
//   GET/POST /persona-mask/state   -> { enabled, activeId }
//   POST     /persona-mask/custom  -> create / update / delete custom personas
// No Harness Client package is imported: React comes from the module table,
// and the controls are plain elements styled with `--dsw-alias-*` tokens.
window.__ModuleLoader__.load({
  id: 'dsh-persona-mask',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const NS = 'persona'
    const API = '/persona-mask/state'
    const CUSTOM_API = '/persona-mask/custom'

    const ZH = {
      title: '人格面具',
      subtitle: '给助手换一副性格。切换后从下一条回复开始生效。',
      enable: '启用人格',
      enabled: '已启用，助手会用下面选中的人格说话。',
      disabled: '已关闭，助手保持默认风格；选中一个人格会自动启用。',
      presets: '人格',
      active: '生效中',
      newPersona: '新建人格',
      edit: '编辑',
      delete: '删除',
      confirmDelete: '确认删除',
      cancel: '取消',
      save: '保存',
      editorNew: '新建自定义人格',
      editorEdit: '编辑自定义人格',
      fieldName: '名字',
      fieldInstructions: '说话方式',
      namePlaceholder: '例如：阴阳怪气的程序员',
      instructionsPlaceholder: '用 2–5 条描述语气、口头禅、称呼和情绪；只写怎么说话，不写任务规则。',
      editorHint: '保存后会出现在列表里；点它即可启用。',
      note: '人格只改变说话方式，不影响事实、工具调用与安全规则。也可以在对话里说「切换成猫娘人格」。',
      loading: '正在读取人格状态…',
      retry: '重试',
    }

    const EN = {
      title: 'Persona',
      subtitle: 'Give the assistant a different personality. A switch applies from the next reply.',
      enable: 'Enable persona',
      enabled: 'On — the assistant speaks as the persona selected below.',
      disabled: 'Off — the default style is used. Selecting a persona turns it on.',
      presets: 'Personas',
      active: 'Active',
      newPersona: 'New persona',
      edit: 'Edit',
      delete: 'Delete',
      confirmDelete: 'Confirm',
      cancel: 'Cancel',
      save: 'Save',
      editorNew: 'New custom persona',
      editorEdit: 'Edit custom persona',
      fieldName: 'Name',
      fieldInstructions: 'Voice',
      namePlaceholder: 'e.g. a sarcastic programmer',
      instructionsPlaceholder: 'Write 2–5 lines about tone, catchphrases, address and mood; describe how to speak, not what to do.',
      editorHint: 'Saved personas appear in the list; click one to use it.',
      note: 'A persona changes tone only; facts, tool use and safety rules stay the same. You can also say “switch to the catgirl persona” in chat.',
      loading: 'Reading persona state…',
      retry: 'Retry',
    }

    const CSS = [
      '.pm { display:flex; flex-direction:column; gap:14px; min-width:0; color:var(--dsw-alias-label-primary); }',
      '.pm-head { display:flex; flex-direction:column; gap:4px; }',
      '.pm-title { margin:0; font-size:15px; font-weight:600; color:var(--dsw-alias-label-primary); }',
      '.pm-subtitle { margin:0; font-size:12px; line-height:1.6; color:var(--dsw-alias-label-secondary); }',
      '.pm-body { display:flex; flex-direction:column; gap:12px; min-width:0; }',
      '.pm-card { border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-layer-1); }',
      '.pm-switch-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 14px; }',
      '.pm-switch-text { display:flex; flex-direction:column; gap:3px; min-width:0; }',
      '.pm-label { font-size:13px; font-weight:600; color:var(--dsw-alias-label-primary); }',
      '.pm-hint { font-size:12px; line-height:1.5; color:var(--dsw-alias-label-secondary); }',
      '.pm-switch { position:relative; width:34px; height:20px; border-radius:999px; border:none; padding:0; flex:none; cursor:pointer; background:var(--dsw-alias-border-l2); transition:background .15s ease; }',
      '.pm-switch.is-on { background:var(--dsw-alias-brand-primary); }',
      '.pm-switch:disabled { opacity:.55; cursor:default; }',
      '.pm-switch:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:2px; }',
      '.pm-knob { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff; transition:left .15s ease; }',
      '.pm-switch.is-on .pm-knob { left:16px; }',
      '.pm-list { display:flex; flex-direction:column; gap:8px; min-width:0; }',
      '.pm-persona { display:flex; align-items:stretch; border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-layer-1); overflow:hidden; }',
      '.pm-persona.is-active { border-color:var(--dsw-alias-brand-primary); }',
      '.pm-persona.is-muted { opacity:.72; }',
      '.pm-persona-select { display:flex; align-items:center; gap:10px; flex:1; min-width:0; text-align:left; padding:10px 12px; border:none; background:none; color:inherit; font:inherit; cursor:pointer; }',
      '.pm-persona-select:hover { background:var(--dsw-alias-bg-layer-2); }',
      '.pm-persona-select:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:-2px; }',
      '.pm-persona-select:disabled { cursor:default; }',
      '.pm-radio { width:15px; height:15px; border-radius:50%; border:1.5px solid var(--dsw-alias-border-l2); flex:none; display:flex; align-items:center; justify-content:center; }',
      '.pm-persona.is-active .pm-radio { border-color:var(--dsw-alias-brand-primary); }',
      '.pm-dot { width:7px; height:7px; border-radius:50%; background:var(--dsw-alias-brand-primary); }',
      '.pm-persona-main { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }',
      '.pm-name { font-size:13px; font-weight:600; color:var(--dsw-alias-label-primary); }',
      '.pm-desc { font-size:12px; line-height:1.5; color:var(--dsw-alias-label-secondary); }',
      '.pm-badge { flex:none; font-size:11px; padding:1px 7px; border-radius:999px; border:1px solid var(--dsw-alias-state-success-primary); color:var(--dsw-alias-state-success-primary); }',
      '.pm-persona-actions { display:flex; align-items:center; gap:2px; padding:0 8px; border-left:1px solid var(--dsw-alias-border-l1); }',
      '.pm-mini { font-size:11px; padding:4px 7px; border-radius:5px; border:1px solid transparent; background:none; color:var(--dsw-alias-label-secondary); cursor:pointer; white-space:nowrap; }',
      '.pm-mini:hover { color:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-border-l1); }',
      '.pm-mini:disabled { opacity:.5; cursor:default; }',
      '.pm-mini-danger:hover { color:var(--dsw-alias-state-error-primary); border-color:var(--dsw-alias-state-error-primary); }',
      '.pm-editor { display:flex; flex-direction:column; gap:10px; padding:12px 14px; border:1px solid var(--dsw-alias-border-l2); border-radius:10px; background:var(--dsw-alias-bg-layer-1); }',
      '.pm-editor-title { font-size:13px; font-weight:600; color:var(--dsw-alias-label-primary); }',
      '.pm-editor-hint { font-size:11px; line-height:1.5; color:var(--dsw-alias-label-secondary); }',
      '.pm-field { display:flex; flex-direction:column; gap:4px; }',
      '.pm-field-label { font-size:12px; color:var(--dsw-alias-label-secondary); }',
      '.pm-input, .pm-textarea { font:inherit; font-size:13px; padding:7px 9px; border-radius:7px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); width:100%; box-sizing:border-box; }',
      '.pm-input:focus-visible, .pm-textarea:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }',
      '.pm-textarea { resize:vertical; min-height:96px; line-height:1.6; }',
      '.pm-editor-actions { display:flex; gap:8px; justify-content:flex-end; }',
      '.pm-btn { font-size:12px; padding:6px 12px; border-radius:6px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); cursor:pointer; }',
      '.pm-btn:hover { border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-brand-primary); }',
      '.pm-btn:disabled { opacity:.5; cursor:default; }',
      '.pm-btn-primary { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }',
      '.pm-btn-primary:hover { color:#fff; opacity:.9; }',
      '.pm-custom-actions { display:flex; justify-content:flex-start; }',
      '.pm-note { margin:0; font-size:12px; line-height:1.6; color:var(--dsw-alias-label-secondary); }',
      '.pm-error { padding:9px 12px; border:1px solid var(--dsw-alias-state-error-primary); border-radius:8px; color:var(--dsw-alias-state-error-primary); font-size:12px; line-height:1.5; }',
      '.pm-loading { padding:14px 2px; font-size:12px; color:var(--dsw-alias-label-secondary); }',
      '.pm-retry { align-self:flex-start; font-size:12px; padding:6px 10px; border-radius:6px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); cursor:pointer; }',
      '.pm-retry:hover { border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-brand-primary); }',
    ].join('\n')

    function errText(error) {
      return String(error && error.message ? error.message : error)
    }

    async function requestJson(url, init) {
      const response = await fetch(url, init)
      const data = await response.json().catch(() => null)
      if (!response.ok || data === null || data.ok === false) {
        throw new Error(data && data.error ? data.error : `HTTP ${response.status}`)
      }
      return data
    }

    /** Re-render on locale change; the bound translator reads live locale data. */
    function useLocaleVersion(ctx) {
      const [, setVersion] = useState(0)
      useEffect(() => {
        try {
          return ctx.locale.subscribe(() => setVersion((value) => value + 1))
        } catch {
          return undefined
        }
      }, [ctx])
    }

    const name = 'dsh-persona-mask'
    const inject = ['slots', 'locale']

    function apply(ctx) {
      ctx.effect(() => {
        try {
          return ctx.locale.register(NS, { zh: ZH, en: EN })
        } catch {
          return () => {}
        }
      }, 'persona: dictionaries')

      const t = ctx.locale.bind(NS)

      function PersonaSection() {
        useLocaleVersion(ctx)
        const [view, setView] = useState(null)
        const [error, setError] = useState('')
        const [busy, setBusy] = useState(false)
        const [draft, setDraft] = useState(null)
        const [confirming, setConfirming] = useState(null)
        const mounted = useRef(true)

        const load = useCallback(() => {
          let cancelled = false
          setError('')
          requestJson(API, { cache: 'no-store' }).then(
            (next) => {
              if (!cancelled) setView(next)
            },
            (failure) => {
              if (!cancelled) setError(errText(failure))
            },
          )
          return () => {
            cancelled = true
          }
        }, [])

        useEffect(() => {
          mounted.current = true
          const cancel = load()
          return () => {
            mounted.current = false
            cancel()
          }
        }, [load])

        const save = useCallback(
          async (patch) => {
            if (busy) return
            setBusy(true)
            setError('')
            try {
              const next = await requestJson(API, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                cache: 'no-store',
                body: JSON.stringify(patch),
              })
              if (mounted.current) setView(next)
            } catch (failure) {
              if (mounted.current) setError(errText(failure))
            } finally {
              if (mounted.current) setBusy(false)
            }
          },
          [busy],
        )

        const sendCustom = useCallback(
          async (payload) => {
            if (busy) return
            setBusy(true)
            setError('')
            try {
              const next = await requestJson(CUSTOM_API, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                cache: 'no-store',
                body: JSON.stringify(payload),
              })
              if (mounted.current) {
                setView(next)
                setDraft(null)
                setConfirming(null)
              }
            } catch (failure) {
              if (mounted.current) setError(errText(failure))
            } finally {
              if (mounted.current) setBusy(false)
            }
          },
          [busy],
        )

        const openNew = () => {
          setDraft({ id: '', name: '', instructions: '' })
          setConfirming(null)
        }

        const openEdit = (persona) => {
          setDraft({
            id: persona.id,
            name: persona.name,
            instructions: typeof persona.instructions === 'string' ? persona.instructions : '',
          })
          setConfirming(null)
        }

        const submitDraft = (event) => {
          event.preventDefault()
          if (draft === null) return
          const draftName = draft.name.trim()
          const instructions = draft.instructions.trim()
          if (draftName === '' || instructions === '') return
          const payload = { action: draft.id ? 'update' : 'create', name: draftName, instructions }
          if (draft.id) payload.id = draft.id
          sendCustom(payload)
        }

        const enabled = view !== null && view.enabled
        const retry =
          view === null && error !== ''
            ? h('button', { type: 'button', className: 'pm-retry', onClick: load }, t('retry'))
            : null

        const editor =
          draft === null
            ? null
            : h(
                'form',
                { className: 'pm-editor', onSubmit: submitDraft },
                h('div', { className: 'pm-editor-title' }, draft.id ? t('editorEdit') : t('editorNew')),
                h(
                  'label',
                  { className: 'pm-field' },
                  h('span', { className: 'pm-field-label' }, t('fieldName')),
                  h('input', {
                    className: 'pm-input',
                    value: draft.name,
                    maxLength: 40,
                    placeholder: t('namePlaceholder'),
                    disabled: busy,
                    onChange: (event) => setDraft({ ...draft, name: event.target.value }),
                  }),
                ),
                h(
                  'label',
                  { className: 'pm-field' },
                  h('span', { className: 'pm-field-label' }, t('fieldInstructions')),
                  h('textarea', {
                    className: 'pm-textarea',
                    rows: 6,
                    value: draft.instructions,
                    maxLength: 4000,
                    placeholder: t('instructionsPlaceholder'),
                    disabled: busy,
                    onChange: (event) => setDraft({ ...draft, instructions: event.target.value }),
                  }),
                ),
                h('div', { className: 'pm-editor-hint' }, t('editorHint')),
                h(
                  'div',
                  { className: 'pm-editor-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'pm-btn',
                      disabled: busy,
                      onClick: () => setDraft(null),
                    },
                    t('cancel'),
                  ),
                  h(
                    'button',
                    {
                      type: 'submit',
                      className: 'pm-btn pm-btn-primary',
                      disabled: busy || draft.name.trim() === '' || draft.instructions.trim() === '',
                    },
                    t('save'),
                  ),
                ),
              )

        return h(
          'div',
          { className: 'pm' },
          h('style', null, CSS),
          h(
            'header',
            { className: 'pm-head' },
            h('h2', { className: 'pm-title' }, t('title')),
            h('p', { className: 'pm-subtitle' }, t('subtitle')),
          ),
          error !== ''
            ? h('div', { className: 'pm-error', role: 'alert' }, error)
            : null,
          retry,
          view === null
            ? error === ''
              ? h('div', { className: 'pm-loading' }, t('loading'))
              : null
            : h(
                'div',
                { className: 'pm-body' },
                h(
                  'section',
                  { className: 'pm-card' },
                  h(
                    'div',
                    { className: 'pm-switch-row' },
                    h(
                      'div',
                      { className: 'pm-switch-text' },
                      h('span', { className: 'pm-label' }, t('enable')),
                      h('span', { className: 'pm-hint' }, enabled ? t('enabled') : t('disabled')),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        role: 'switch',
                        'aria-checked': enabled,
                        'aria-label': t('enable'),
                        className: 'pm-switch' + (enabled ? ' is-on' : ''),
                        disabled: busy,
                        onClick: () => save({ enabled: !enabled }),
                      },
                      h('span', { className: 'pm-knob' }),
                    ),
                  ),
                ),
                h(
                  'section',
                  { className: 'pm-list', role: 'radiogroup', 'aria-label': t('presets') },
                  view.presets.map((persona) => {
                    const selected = view.activeId === persona.id
                    const isConfirming = confirming === persona.id
                    return h(
                      'div',
                      {
                        key: persona.id,
                        className:
                          'pm-persona' +
                          (selected ? ' is-active' : '') +
                          (enabled ? '' : ' is-muted'),
                      },
                      h(
                        'button',
                        {
                          type: 'button',
                          role: 'radio',
                          'aria-checked': selected,
                          className: 'pm-persona-select',
                          disabled: busy,
                          onClick: () => {
                            if (!selected || !enabled) save({ activeId: persona.id })
                          },
                        },
                        h(
                          'span',
                          { className: 'pm-radio', 'aria-hidden': true },
                          selected ? h('span', { className: 'pm-dot' }) : null,
                        ),
                        h(
                          'span',
                          { className: 'pm-persona-main' },
                          h('span', { className: 'pm-name' }, persona.name),
                          h('span', { className: 'pm-desc' }, persona.summary),
                        ),
                        selected && enabled
                          ? h('span', { className: 'pm-badge' }, t('active'))
                          : null,
                      ),
                      persona.custom
                        ? h(
                            'div',
                            { className: 'pm-persona-actions' },
                            isConfirming
                              ? [
                                  h(
                                    'button',
                                    {
                                      key: 'confirm',
                                      type: 'button',
                                      className: 'pm-mini pm-mini-danger',
                                      disabled: busy,
                                      onClick: () =>
                                        sendCustom({ action: 'delete', id: persona.id }),
                                    },
                                    t('confirmDelete'),
                                  ),
                                  h(
                                    'button',
                                    {
                                      key: 'cancel',
                                      type: 'button',
                                      className: 'pm-mini',
                                      disabled: busy,
                                      onClick: () => setConfirming(null),
                                    },
                                    t('cancel'),
                                  ),
                                ]
                              : [
                                  h(
                                    'button',
                                    {
                                      key: 'edit',
                                      type: 'button',
                                      className: 'pm-mini',
                                      disabled: busy,
                                      onClick: () => openEdit(persona),
                                    },
                                    t('edit'),
                                  ),
                                  h(
                                    'button',
                                    {
                                      key: 'delete',
                                      type: 'button',
                                      className: 'pm-mini pm-mini-danger',
                                      disabled: busy,
                                      onClick: () => setConfirming(persona.id),
                                    },
                                    t('delete'),
                                  ),
                                ],
                          )
                        : null,
                    )
                  }),
                ),
                draft === null
                  ? h(
                      'div',
                      { className: 'pm-custom-actions' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'pm-btn',
                          disabled: busy,
                          onClick: openNew,
                        },
                        t('newPersona'),
                      ),
                    )
                  : null,
                editor,
                h('p', { className: 'pm-note' }, t('note')),
              ),
        )
      }

      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'persona',
            order: 32,
            label: () => ctx.locale.bind(NS)('title'),
            locale: NS,
          },
          PersonaSection,
        ),
      )
    }

    return { name, inject, apply }
  },
})
