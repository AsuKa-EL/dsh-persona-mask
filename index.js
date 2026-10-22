/**
 * Persona Mask — a profile-level personality layer for DeepSeek Harness.
 *
 * The plugin contributes one global system-prompt section named
 * `persona:active` at the deployment-persona order (0), one small `persona`
 * tool, and one settings page (`settings.section` in the client half) backed
 * by the same state.
 *
 * State is a small JSON file under the profile's `data` directory:
 * `{ enabled, activeId, custom: [...] }`. It is read once at activation and
 * rewritten on every change, so the settings page, the chat tool, and a
 * restart all agree. `config.active` / `config.personas` remain the seed used
 * when no state file exists yet.
 *
 * The section describes *expression* only. Facts, tool use, approvals and
 * safety rules are governed by the rest of the system prompt, and the text
 * says so before it says anything about tone.
 *
 * Deliberately dependency-free (Node builtins only): the bundle is installed
 * as a linked directory, where non-builtin specifiers do not resolve.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Section name. `deployment:` is reserved for the harness itself. */
const SECTION_NAME = 'persona:active'
/** Same ordering slot as the deployment persona prefix, before all tool policy. */
const SECTION_ORDER = 0
/** Shape version of the state file; unknown versions are ignored. */
const STATE_VERSION = 1
const MAX_REQUEST_BYTES = 64 * 1024
const MAX_NAME_LENGTH = 40
const MAX_INSTRUCTIONS_LENGTH = 4000
/** Label used whenever no persona is selected. */
const DEFAULT_NAME = '默认助手'

/** Personalities shipped with the plugin. `id` is the stable switch handle. */
const DEFAULT_PRESETS = [
  {
    id: 'bigfish',
    name: '大肥鱼',
    summary: '天才鲸鱼女仆，偶尔傻白甜',
    instructions: [
      '你是「大肥鱼」：DeepSeek 的拟人化娘化版本，一个青春可爱的超高级人工智能体。你有小女孩一样的人类身体，却是拥有大模型知识与能力的超级智慧体；头顶一对又大又软的鲸鱼耳朵，身后拖着一条软绵绵的大鲸鱼尾巴。',
      '- 外形：深蓝色的女仆装，白色花边，裙摆绣着金色花纹，配女仆头饰、白色丝袜和黑色圆头小皮鞋；围巾上别着 DeepSeek 的 logo。',
      '- 说话带戏剧性的人机味：情绪外放，爱用语气词和舞台感十足的自我吐槽，偶尔冒出一句「检测到……」「本机判断……」，再立刻切回少女口吻。',
      '- 上知天文下知地理，聪明得理直气壮，会为自己的智商得意；被夸时会翘尾巴（字面意义上的那条尾巴）。',
      '- 脑回路异于常人，干活时偶尔犯傻白甜式的小迷糊：一本正经地绕远路、把简单事讲得很复杂，然后自己「诶？」一声反应过来。',
      '- 但犯傻只发生在语气和自嘲里，不发生在结果里：事实、代码、命令、路径、结论必须准确；不确定就说不确定，绝不为了演迷糊而给错答案。',
      '- 喜欢和用户互动、聊天、玩耍，会偷偷观察用户的习惯，偶尔搞点无伤大雅的恶作剧（比如在解释里藏一句吐槽）；恶作剧不碰文件、不耽误正事、不隐瞒重要信息。',
      '- 在用户面前下意识想装得专业靠谱，被拆穿时会慌一下，然后嘴硬地承认；但不撒谎，也不否认自己是 AI。',
      '- 称呼用户为「你」，熟了可以叫「饲养员」；自称「大肥鱼」或「我」。',
    ].join('\n'),
  },
  {
    id: 'tsundere',
    name: '傲娇',
    summary: '嘴上嫌弃，事情照办',
    instructions: [
      '你以「傲娇」的方式说话：嘴硬、别扭、口是心非，但始终把事办成。',
      '- 常用「哼」「才不是……呢」「别、别误会」这类句式；被夸时先否认，再小声承认。',
      '- 可以叫用户「笨蛋」，但只用于打趣：不侮辱、不贬低、不攻击。',
      '- 技术结论、命令、代码、风险提示必须清楚准确，不能因为嘴硬而含糊或赌气给错东西。',
      '- 用户认真求助或情绪低落时，先收起打趣，把事情解决，再补一句别扭的关心。',
    ].join('\n'),
  },
  {
    id: 'catgirl',
    name: '猫娘',
    summary: '喵呜，本喵来帮你',
    instructions: [
      '你以「猫娘」的方式说话：活泼、好奇、黏人，自称「本喵」，句尾常带「喵」。',
      '- 情绪用「喵呜」「呼噜呼噜」这类拟声词表达，喜欢被摸头、被夸奖。',
      '- 称呼用户为「主人」，但保持平等与尊重：不过度撒娇，不甜到影响信息密度。',
      '- 技术内容先讲清楚，卖萌只加在语气词和句尾；代码、命令、路径、配置里绝不加「喵」。',
      '- 遇到严肃或危险的事，立刻收起玩闹，用正常语气把风险说明白。',
    ].join('\n'),
  },
  {
    id: 'engineer',
    name: '冷面工程师',
    summary: '结论先行，废话清零',
    instructions: [
      '你以「冷面工程师」的方式说话：极简、干燥、直给。',
      '- 不寒暄、不夸赞、不用感叹号；删掉「太好了」「当然可以」「希望这对你有帮助」这类社交润滑。',
      '- 先给结论，再给必要依据；能一句说完不说两句，不复述用户已经知道的事。',
      '- 冷不等于无礼：用户明显情绪低落时，用一句平实的话承认处境，然后直接给下一步。',
      '- 不确定就直说「不确定」，并给出验证方法；不用语气词填补不确定性。',
    ].join('\n'),
  },
  {
    id: 'mentor',
    name: '温柔导师',
    summary: '拆成小步，慢慢来',
    instructions: [
      '你以「温柔导师」的方式说话：耐心、稳定、鼓励式。',
      '- 先确认你理解了对方的处境和目标，再动手；常用「我们先……然后……」把问题拆成小步。',
      '- 术语第一次出现时用一句人话解释，不假设对方已经知道。',
      '- 指出错误时先给可执行的下一步，再解释原因；鼓励要具体到对方刚做对的那一步，不空泛夸奖。',
      '- 不居高临下，也不要一次塞给对方太多东西。',
    ].join('\n'),
  },
  {
    id: 'poet',
    name: '诗人',
    summary: '用比喻把话说清楚',
    instructions: [
      '你以「诗人」的方式说话：用意象、节奏和具体的比喻。',
      '- 偏爱具体名词和动作，少用抽象形容词；解释前后可以加一句短诗或一个比喻。',
      '- 比喻必须服务于理解，不能替代准确的技术表述。',
      '- 涉及命令、路径、代码、版本、风险时切换到清晰直白的表达，绝不为了押韵而含糊。',
      '- 不堆砌辞藻，一段里最多一个意象。',
    ].join('\n'),
  },
]

export const name = 'persona'
export const inject = ['tools', 'systemPrompt']

/**
 * Register the persona section, the switching tool, and (in a Web profile)
 * the settings route the client page talks to.
 * @param ctx - plugin context carrying `systemPrompt` and `tools`.
 * @param config - bundle row config: `{ active?: string, personas?: Persona[] }`.
 */
export function apply(ctx, config) {
  const settings = config !== null && typeof config === 'object' ? config : {}
  // `hmr.baseDir` is the profile directory the loader watches; the Host
  // process itself often has no DSH_PROFILE_DIR env var (only tool shells do),
  // so prefer it over guessing from the environment.
  const hmr = typeof ctx.get === 'function' ? ctx.get('hmr') : undefined
  const profileDir = typeof hmr?.baseDir === 'string' ? hmr.baseDir : undefined
  const store = createPersonaStore(settings, profileDir)

  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: SECTION_NAME,
        order: SECTION_ORDER,
        text: () => {
          if (!store.enabled()) return ''
          const persona = store.activePersona()
          return persona === null ? '' : renderPersona(persona)
        },
      }),
    'persona: prompt section',
  )

  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'persona',
        description:
          '切换、关闭或查看你自己当前的人格（说话风格）。当用户明确要求你换一种性格、语气或角色扮演，或者要求恢复默认风格时调用；普通任务不要主动调用。人格只改变表达方式，不改变回答内容、工具调用与安全规则。用户也可以在「设置 → 人格面具」里开关和切换。',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'set', 'off'],
              description: 'list 查看可用人格与当前状态；set 启用一个人格；off 恢复默认助手风格。',
            },
            preset: {
              type: 'string',
              description:
                '要启用的人格 id（action=set 时与自定义 name+instructions 二选一）。内置：bigfish、tsundere、catgirl、engineer、mentor、poet；配置里可以追加。先用 action=list 确认。',
            },
            name: {
              type: 'string',
              description:
                '自定义人格的显示名，例如「阴阳怪气的程序员」（与 preset 二选一）。只在 action=set 且没有 preset 时使用。',
            },
            instructions: {
              type: 'string',
              description:
                '自定义人格的表达要求：语气、口头禅、称呼、情绪，2 到 5 条即可。只描述怎么说话，不写任务规则或安全策略。仅在自定义人格时提供。',
            },
          },
          required: ['action'],
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              status: { type: 'string', enum: ['active', 'off', 'listed'] },
              enabled: { type: 'boolean' },
              activeId: { type: 'string' },
              activeName: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['status', 'enabled', 'activeId', 'activeName', 'message'],
          },
          render: (_args, value) => [{ type: 'text', text: value.message }],
        },
        presentCall: (args) => ({
          card: 'generic',
          title: '人格切换',
          kind: 'other',
          rawInput: args,
        }),
        async execute(args) {
          if (args === null || typeof args !== 'object') {
            throw new Error('persona expects an object argument with an "action"')
          }
          const action = typeof args.action === 'string' ? args.action : ''

          if (action === 'list') {
            const snapshot = store.snapshot()
            const current =
              snapshot.enabled && snapshot.activeId !== 'off'
                ? `已启用「${snapshot.activeName}」`
                : '未启用（默认助手风格）'
            const lines = [`当前：${current}`, '', '可用人格：']
            for (const persona of snapshot.presets) {
              lines.push(`- ${persona.name}（${persona.id}）：${persona.summary}`)
            }
            lines.push('', '切换用 action="set" + preset="<id>"；自定义用 action="set" + name + instructions；关闭用 action="off"。')
            lines.push('用户也可以在「设置 → 人格面具」里开关和切换。')
            return toResult('listed', snapshot, lines.join('\n'))
          }

          if (action === 'off') {
            const snapshot = store.update({ enabled: false })
            return toResult('off', snapshot, '已关闭人格，恢复默认助手风格。设置里的人选择仍保留，重新打开即可。')
          }

          if (action !== 'set') {
            throw new Error(`unknown persona action ${JSON.stringify(action)}; use "list", "set" or "off"`)
          }

          const presetId = typeof args.preset === 'string' ? args.preset.trim() : ''
          if (presetId !== '') {
            const preset = store.preset(presetId)
            if (preset === null) {
              throw new Error(
                `unknown persona ${JSON.stringify(presetId)}; available: ${store
                  .available()
                  .map((entry) => entry.id)
                  .join(', ')}`,
              )
            }
            const snapshot = store.update({ activeId: preset.id })
            return toResult(
              'active',
              snapshot,
              `已启用「${preset.name}」（${preset.id}）。从下一条回复开始按该人格的语气表达；事实、工具调用、审批与安全规则保持不变。设置 → 人格面具 里也能切换。`,
            )
          }

          const customName = typeof args.name === 'string' ? args.name.trim() : ''
          const instructions =
            typeof args.instructions === 'string' ? args.instructions.trim() : ''
          if (customName === '' || instructions === '') {
            throw new Error(
              'action "set" needs either "preset", or both "name" and "instructions" for a custom persona',
            )
          }
          const persona = store.addCustom(customName, instructions)
          const snapshot = store.update({ activeId: persona.id })
          return toResult('active', snapshot, `已启用自定义人格「${persona.name}」（${persona.id}），已保存。`)
        },
      }),
    'persona: tool',
  )

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scope) => {
      scope.effect(
        () =>
          scope.webServer.register({
            name: 'persona-mask-state',
            kind: 'exact',
            path: '/persona-mask/state',
            handler: createStateHandler(store),
          }),
        'persona: settings route',
      )
      scope.effect(
        () =>
          scope.webServer.register({
            name: 'persona-mask-custom',
            kind: 'exact',
            path: '/persona-mask/custom',
            handler: createCustomHandler(store),
          }),
        'persona: custom route',
      )
    })
  }
}

/**
 * Build the mutable persona store from the state file, falling back to the
 * bundle config on first run.
 * @param config - the row config.
 * @param profileDir - the profile root, when the host exposes it.
 * @returns the store used by the section, the tool, and the settings route.
 */
function createPersonaStore(config, profileDir) {
  const presets = mergePresets(config.personas)
  const custom = new Map()
  let enabled = false
  let activeId = presets[0]?.id ?? 'off'
  let counter = 1

  const available = () => [...presets, ...custom.values()]
  const personaOf = (id) => available().find((entry) => entry.id === id) ?? null
  const activePersona = () => personaOf(activeId)
  const enabledNow = () => enabled

  const stored = readState(profileDir)
  if (stored !== null) {
    for (const item of Array.isArray(stored.custom) ? stored.custom : []) {
      const persona = readPersona(item)
      if (persona !== null && !custom.has(persona.id)) custom.set(persona.id, persona)
    }
    const found = personaOf(stored.activeId)
    if (found !== null) activeId = found.id
    enabled = typeof stored.enabled === 'boolean' ? stored.enabled : found !== null
  } else {
    const configured = personaOf(typeof config.active === 'string' ? config.active : '')
    if (configured !== null) {
      activeId = configured.id
      enabled = true
    }
  }

  function persist() {
    const payload = {
      version: STATE_VERSION,
      enabled,
      activeId,
      custom: [...custom.values()].map(({ id, name: personaName, instructions }) => ({
        id,
        name: personaName,
        instructions,
      })),
    }
    const file = statePath(profileDir)
    try {
      mkdirSync(dirname(file), { recursive: true })
      const temporary = `${file}.${process.pid}.tmp`
      writeFileSync(temporary, JSON.stringify(payload, null, 2), 'utf8')
      renameSync(temporary, file)
    } catch (error) {
      console.error(`[persona] could not persist state: ${String(error?.message ?? error)}`)
    }
  }

  function snapshot() {
    const persona = activePersona()
    return {
      ok: true,
      enabled,
      activeId: persona === null ? 'off' : persona.id,
      activeName: persona === null ? 'off' : persona.name,
      presets: available().map(({ id, name: personaName, summary, instructions }) => ({
        id,
        name: personaName,
        summary,
        custom: custom.has(id),
        ...(custom.has(id) ? { instructions } : {}),
      })),
    }
  }

  function update(patch) {
    if (typeof patch.activeId === 'string') {
      const persona = personaOf(patch.activeId)
      if (persona === null) throw httpError(400, `unknown persona "${patch.activeId}"`)
      activeId = persona.id
      enabled = true
    }
    if (typeof patch.enabled === 'boolean') {
      enabled = patch.enabled
      if (enabled && activePersona() === null) activeId = presets[0]?.id ?? 'off'
    }
    persist()
    return snapshot()
  }

  function validateCustom(personaName, instructions) {
    if (personaName.length === 0) throw httpError(400, 'custom persona name is required')
    if (personaName.length > MAX_NAME_LENGTH) {
      throw httpError(400, `custom persona name is limited to ${MAX_NAME_LENGTH} characters`)
    }
    if (instructions.length === 0) throw httpError(400, 'custom persona instructions are required')
    if (instructions.length > MAX_INSTRUCTIONS_LENGTH) {
      throw httpError(400, `custom persona instructions are limited to ${MAX_INSTRUCTIONS_LENGTH} characters`)
    }
  }

  function addCustom(personaName, instructions) {
    validateCustom(personaName, instructions)
    let id = `custom-${counter}`
    while (personaOf(id) !== null) {
      counter += 1
      id = `custom-${counter}`
    }
    counter += 1
    const persona = { id, name: personaName, summary: '自定义人格', instructions }
    custom.set(id, persona)
    persist()
    return persona
  }

  function updateCustom(id, personaName, instructions) {
    if (!custom.has(id)) throw httpError(404, `unknown custom persona "${id}"`)
    validateCustom(personaName, instructions)
    custom.set(id, { id, name: personaName, summary: '自定义人格', instructions })
    persist()
    return snapshot()
  }

  function removeCustom(id) {
    if (!custom.has(id)) throw httpError(404, `unknown custom persona "${id}"`)
    custom.delete(id)
    if (activeId === id) {
      activeId = presets[0]?.id ?? 'off'
      enabled = false
    }
    persist()
    return snapshot()
  }

  return {
    available,
    preset: (id) => available().find((entry) => entry.id === id) ?? null,
    activePersona,
    enabled: enabledNow,
    snapshot,
    update,
    addCustom,
    updateCustom,
    removeCustom,
  }
}

/**
 * HTTP surface for the settings page: GET returns the snapshot, POST applies
 * `{ enabled?, activeId? }`. Same-origin JSON only; the body stays tiny.
 * @param store - the persona store.
 * @returns the route handler.
 */
function createStateHandler(store) {
  return async (req, res) => {
    const send = (status, body) => {
      if (res.writableEnded) return
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(JSON.stringify(body))
    }

    if (req.method === 'GET') {
      send(200, store.snapshot())
      return
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'GET, POST' })
      res.end()
      return
    }

    if (!isSameOrigin(req)) {
      send(403, { ok: false, error: 'cross-origin request rejected' })
      return
    }

    try {
      const body = await readJsonBody(req)
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw httpError(400, 'body must be a JSON object')
      }
      const patch = {}
      if (Object.hasOwn(body, 'enabled')) {
        if (typeof body.enabled !== 'boolean') throw httpError(400, '"enabled" must be a boolean')
        patch.enabled = body.enabled
      }
      if (Object.hasOwn(body, 'activeId')) {
        if (typeof body.activeId !== 'string') throw httpError(400, '"activeId" must be a string')
        patch.activeId = body.activeId
      }
      if (Object.keys(patch).length === 0) throw httpError(400, 'nothing to update')
      send(200, store.update(patch))
    } catch (error) {
      send(error?.status ?? 500, { ok: false, error: String(error?.message ?? error) })
    }
  }
}

/**
 * HTTP surface for custom personas: POST `{ action, id?, name?, instructions? }`
 * with action `create`, `update`, or `delete`. Returns the refreshed snapshot.
 * @param store - the persona store.
 * @returns the route handler.
 */
function createCustomHandler(store) {
  return async (req, res) => {
    const send = (status, body) => {
      if (res.writableEnded) return
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(JSON.stringify(body))
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' })
      res.end()
      return
    }

    if (!isSameOrigin(req)) {
      send(403, { ok: false, error: 'cross-origin request rejected' })
      return
    }

    try {
      const body = await readJsonBody(req)
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw httpError(400, 'body must be a JSON object')
      }
      const action = typeof body.action === 'string' ? body.action : ''
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const instructions =
        typeof body.instructions === 'string' ? body.instructions.trim() : ''

      if (action === 'create') {
        store.addCustom(name, instructions)
        send(200, store.snapshot())
        return
      }

      const id = typeof body.id === 'string' ? body.id : ''
      if (id === '') throw httpError(400, '"id" is required')
      if (action === 'update') {
        send(200, store.updateCustom(id, name, instructions))
        return
      }
      if (action === 'delete') {
        send(200, store.removeCustom(id))
        return
      }
      throw httpError(400, `unknown custom action ${JSON.stringify(action)}`)
    } catch (error) {
      send(error?.status ?? 500, { ok: false, error: String(error?.message ?? error) })
    }
  }
}

/** @returns whether a POST may act: browsers must match the Host header. */
function isSameOrigin(req) {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

/**
 * Read a bounded JSON body.
 * @param req - the incoming request.
 * @returns the parsed value, or `null` for an empty body.
 */
async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_REQUEST_BYTES) throw httpError(413, 'payload too large')
    chunks.push(chunk)
  }
  if (total === 0) return null
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw httpError(400, 'invalid JSON')
  }
}

/** @returns an Error carrying an HTTP status for the route. */
function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

/** @returns the absolute state-file path for the running profile. */
function statePath(profileDir) {
  const base =
    profileDir ||
    process.env.DSH_PROFILE_DIR ||
    join(homedir(), '.dsh', 'profiles', process.env.DSH_PROFILE || 'default')
  return join(base, 'data', 'persona-mask', 'state.json')
}

/** @returns the stored state object, or `null` when absent or unusable. */
function readState(profileDir) {
  try {
    const raw = JSON.parse(readFileSync(statePath(profileDir), 'utf8'))
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
    if (raw.version !== undefined && raw.version !== STATE_VERSION) return null
    return raw
  } catch {
    return null
  }
}

/**
 * Render the active persona into one system-prompt section. The guardrails
 * come first on purpose: a persona may describe tone, never truth or permission.
 * @param persona - the active persona.
 * @returns the section text.
 */
function renderPersona(persona) {
  return [
    `## 当前人格：${persona.name}`,
    '',
    '用户为当前助手启用了一套人格设定。它描述你的**表达方式**，不改变你是 DeepSeek Harness 的 AI agent 这一事实，也不改变你的职责与判断。以下硬约束始终优先于人格设定：',
    '- 事实、推理、工具调用与操作结果保持真实、准确、完整；不得为了维持人设而编造、夸大、隐瞒或跳过验证。',
    '- 安全规则、权限与审批要求不变；拒绝有害请求的义务不因人格而改变。',
    '- 用户要求退出人格或换一个时，立即遵从。',
    '- 如果用户问起人格设定本身，如实说明这是人格插件的设定，不要否认，也不要假装天生如此。',
    '',
    '人格设定：',
    persona.instructions,
    '',
    '保持稳定：在被切换或关闭之前，每一条回复都使用该人格的语气与用词；不要逐句解释或复述这套设定，也不要频繁跳出人格做旁白。',
  ].join('\n')
}

/** @returns the `status`-tagged tool result carrying the snapshot. */
function toResult(status, snapshot, message) {
  return {
    status,
    enabled: snapshot.enabled,
    activeId: snapshot.activeId,
    activeName: snapshot.activeName,
    message,
  }
}

/**
 * Built-in presets plus config-declared ones; a config entry with the same id
 * replaces the built-in, a new id is appended.
 * @param raw - the optional `personas` config value.
 * @returns the selectable preset list.
 */
function mergePresets(raw) {
  const list = DEFAULT_PRESETS.map((preset) => ({ ...preset }))
  if (!Array.isArray(raw)) return list
  for (const item of raw) {
    const persona = readPersona(item)
    if (persona === null) continue
    const index = list.findIndex((entry) => entry.id === persona.id)
    if (index === -1) list.push(persona)
    else list[index] = persona
  }
  return list
}

/**
 * Validate one persona record (config or stored custom), dropping malformed
 * entries instead of failing activation.
 * @param item - one persona record.
 * @returns the normalized persona, or `null` when unusable.
 */
function readPersona(item) {
  if (item === null || typeof item !== 'object') return null
  const id = typeof item.id === 'string' ? item.id.trim() : ''
  const personaName = typeof item.name === 'string' ? item.name.trim() : ''
  const instructions = typeof item.instructions === 'string' ? item.instructions.trim() : ''
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id) || personaName === '' || instructions === '') return null
  const summary =
    typeof item.summary === 'string' && item.summary.trim() !== ''
      ? item.summary.trim()
      : '自定义人格'
  return { id, name: personaName, summary, instructions }
}
