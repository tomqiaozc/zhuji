import dayjs from 'dayjs'
import { db } from '@/db'
import { STAGE_TEMPLATES } from '@/data/templates'
import { uid } from '@/lib/uid'
import type { DecorNode, NodeStatus, Project, Purchase } from '@/types'

/**
 * 加载示例项目 —— 一个"已经装到一半"的真实感样本数据。
 * 不写死 id，每次调用生成新项目，不污染已有数据。
 *
 * 节点规划：
 *  - 前期准备 / 设计 / 主体改造 = done
 *  - 水电改造 / 防水 / 瓦工 = doing（业主当前阶段）
 *  - 木工及以后 = todo
 * 采购流水 ≈ 30 笔，覆盖主要节点，总额落在 ¥60k - ¥80k 区间。
 */

const DONE_STAGES = new Set(['前期准备', '设计', '主体改造'])
const DOING_STAGES = new Set(['水电改造', '防水', '瓦工'])

const NODE_NOTES: Record<string, string> = {
  房屋验收: '收房当天验完，2 处空鼓画圈拍照存档。',
  量房与户型分析: '设计师 4/1 量房，复核误差 ≤ 2cm。',
  风格定调: '定了"现代简约 + 一点原木"，主色蓝灰 + 米白。',
  '装修方式选择（全包/半包/清包）': '半包，主材自采。合同保留 10% 尾款。',
  '装修公司/工长选择': '王师傅工长，工地考察过 2 个，口碑可。',
  总预算与资金计划: '总预算 28w，含 15% 应急。每阶段进度付款。',
  '物业手续 / 开工证': '4/8 拿到开工证，押金 3000。',
  平面方案: '终稿 4/12，业主签字。',
  水电点位图: '4/15 定点，插座 + 18 比合同多。',
  全屋定制方案: 'A 品牌 E0 板，5/2 第一次复尺。',
  主材清单确认: '瓷砖、卫浴、五金 4/20 前下单完毕。',
  '拆墙 / 砌墙': '4/22 拆除完毕，承重墙没动。新砌 2 段轻体。',
  门窗拆改: '4/26 皇派系统窗装完，断桥铝 1.4mm。',
  垃圾清运: '4/24 一次清运 18 袋。',
  水路改造: '王师傅 5/18 到场，水管走顶，PPR 25。',
  电路改造: '5/19-22 走线，强弱电分管，空调独立 4mm²。',
  '中央空调 / 新风预埋': '5/16 大金中央空调内机就位。',
  水电验收: '预计 5/30，业主到场。',
  厨卫防水施工: '5/23 涂第一遍东方雨虹 JS。',
  闭水试验: '计划 5/28 闭水 48h。',
  瓷砖采购: '马可波罗 / 蒙娜丽莎，5/15 全部到货。',
  厨卫墙地砖: '5/26 开始铺贴，瓦工 2 人。',
  '蹲坑 / 地漏 / 烟道': '潜水艇深水封地漏 4 个，止逆阀 1。',
  '阳台 / 露台防水': '阳台做了卫生间标准防水（图片占位）。',
}

function pickNodeId(nodes: DecorNode[], stage: string, nameLike?: string): string | null {
  const candidates = nodes.filter((n) => n.stage === stage)
  if (candidates.length === 0) return null
  if (nameLike) {
    const hit = candidates.find((n) => n.name.includes(nameLike))
    if (hit) return hit.id
  }
  return candidates[0].id
}

function nodeStatusFor(stage: string): NodeStatus {
  if (DONE_STAGES.has(stage)) return 'done'
  if (DOING_STAGES.has(stage)) return 'doing'
  return 'todo'
}

interface StageDateRange {
  plannedStart: string
  plannedEnd: string
  actualStart?: string
  actualEnd?: string
}

function buildStageSchedule(startDate: string): Record<string, StageDateRange> {
  // 每阶段 5-15 天的真实施工节奏
  const stagePlan: Array<[string, number]> = [
    ['前期准备', 14],
    ['设计', 12],
    ['主体改造', 6],
    ['水电改造', 12],
    ['防水', 5],
    ['瓦工', 14],
    ['木工', 10],
    ['油工', 12],
    ['安装', 15],
    ['软装家电', 10],
    ['收尾', 7],
  ]
  const out: Record<string, StageDateRange> = {}
  let cursor = dayjs(startDate)
  for (const [stage, days] of stagePlan) {
    const ps = cursor.format('YYYY-MM-DD')
    const pe = cursor.add(days - 1, 'day').format('YYYY-MM-DD')
    const range: StageDateRange = { plannedStart: ps, plannedEnd: pe }
    const today = dayjs()
    if (DONE_STAGES.has(stage)) {
      range.actualStart = ps
      // 实际比计划略有偏差，+/- 1-2 天
      range.actualEnd = cursor.add(days, 'day').format('YYYY-MM-DD')
    } else if (DOING_STAGES.has(stage)) {
      range.actualStart = ps
      // doing 没有 actualEnd
      if (today.isBefore(dayjs(ps))) {
        range.actualStart = today.format('YYYY-MM-DD')
      }
    }
    out[stage] = range
    cursor = cursor.add(days, 'day')
  }
  return out
}

interface SeedPurchase {
  stage: string
  nodeName?: string
  name: string
  spec?: string
  brand?: string
  channel?: string
  category: string
  unitPrice: number
  quantity: number
  daysBack: number // 距今多少天前
  purchaseUrl?: string
  remark?: string
}

// 真实感采购清单，覆盖主要节点。29 笔，合计约 ¥75,300。
const SEED_PURCHASES: SeedPurchase[] = [
  {
    stage: '设计',
    nodeName: '主材清单',
    name: '装修设计费',
    brand: '本地设计工作室',
    channel: '线下',
    category: '工程',
    unitPrice: 3500,
    quantity: 1,
    daysBack: 52,
    remark: '平面 + 水电 + 效果图 3 张。',
  },
  {
    stage: '主体改造',
    nodeName: '拆墙',
    name: '拆除人工费',
    brand: '王师傅工地',
    channel: '工长',
    category: '工程',
    unitPrice: 1800,
    quantity: 1,
    daysBack: 45,
    remark: '拆除 + 2 段轻体砖砌墙。',
  },
  {
    stage: '主体改造',
    nodeName: '门窗',
    name: '皇派系统窗 断桥铝',
    spec: '1.4mm 壁厚 / 5+12A+5',
    brand: '皇派',
    channel: '品牌门店',
    category: '主材',
    unitPrice: 1280,
    quantity: 4,
    daysBack: 40,
    purchaseUrl: 'https://www.paifenestration.com/',
    remark: '客厅 + 主卧 + 两次卧。图片占位。',
  },
  {
    stage: '主体改造',
    nodeName: '垃圾',
    name: '装修垃圾清运',
    channel: '小区清运队',
    category: '工程',
    unitPrice: 25,
    quantity: 18,
    daysBack: 42,
    remark: '18 袋。',
  },
  {
    stage: '水电改造',
    nodeName: '水路',
    name: '日丰 PPR 冷热水管',
    spec: 'DN25',
    brand: '日丰',
    channel: '京东',
    category: '辅材',
    unitPrice: 22,
    quantity: 60,
    daysBack: 12,
    purchaseUrl: 'https://item.jd.com/100012345678.html',
    remark: '冷热水管 60m。',
  },
  {
    stage: '水电改造',
    nodeName: '水路',
    name: '水电改造人工',
    brand: '王师傅工地',
    channel: '工长',
    category: '工程',
    unitPrice: 4800,
    quantity: 1,
    daysBack: 10,
    remark: '水路 + 电路总包。',
  },
  {
    stage: '水电改造',
    nodeName: '电路',
    name: '远东 BV 电线',
    spec: '2.5mm² 100m/卷',
    brand: '远东',
    channel: '天猫',
    category: '辅材',
    unitPrice: 380,
    quantity: 4,
    daysBack: 11,
    purchaseUrl: 'https://detail.tmall.com/item.htm?id=600000001',
    remark: '插座主线 4 卷。',
  },
  {
    stage: '水电改造',
    nodeName: '电路',
    name: '远东 BV 电线',
    spec: '4mm² 单芯',
    brand: '远东',
    channel: '天猫',
    category: '辅材',
    unitPrice: 480,
    quantity: 2,
    daysBack: 11,
    purchaseUrl: 'https://detail.tmall.com/item.htm?id=600000002',
    remark: '空调 / 大功率回路。',
  },
  {
    stage: '水电改造',
    nodeName: '电路',
    name: '联塑 PVC 穿线管',
    spec: 'DN16/20',
    brand: '联塑',
    channel: '京东',
    category: '辅材',
    unitPrice: 6,
    quantity: 120,
    daysBack: 11,
    purchaseUrl: 'https://item.jd.com/100012345679.html',
  },
  {
    stage: '水电改造',
    nodeName: '电路',
    name: '公牛开关插座面板',
    spec: 'G28 系列 五孔带 USB',
    brand: '公牛',
    channel: '天猫',
    category: '五金',
    unitPrice: 38,
    quantity: 42,
    daysBack: 8,
    purchaseUrl: 'https://detail.tmall.com/item.htm?id=600000010',
    remark: '全屋 42 个面板。',
  },
  {
    stage: '水电改造',
    nodeName: '中央空调',
    name: '大金中央空调（首付）',
    spec: '一拖三 入门款',
    brand: '大金',
    channel: '品牌门店',
    category: '家电',
    unitPrice: 6800,
    quantity: 1,
    daysBack: 16,
    purchaseUrl: 'https://www.daikin-china.com.cn/',
    remark: '5/11 交首付 50%，含预埋。图片占位。',
  },
  {
    stage: '防水',
    nodeName: '厨卫防水',
    name: '东方雨虹 JS 防水涂料',
    spec: '20kg/桶',
    brand: '东方雨虹',
    channel: '京东',
    category: '辅材',
    unitPrice: 320,
    quantity: 4,
    daysBack: 6,
    purchaseUrl: 'https://item.jd.com/100012345680.html',
    remark: '两卫一厨。',
  },
  {
    stage: '防水',
    nodeName: '厨卫防水',
    name: '防水网格布 + 阴阳角加强',
    spec: '宽 200mm',
    brand: '雨虹辅材',
    channel: '京东',
    category: '辅材',
    unitPrice: 6,
    quantity: 50,
    daysBack: 6,
  },
  {
    stage: '瓦工',
    nodeName: '瓷砖采购',
    name: '马可波罗 通体大理石瓷砖',
    spec: '800x800mm 灰白系',
    brand: '马可波罗',
    channel: '品牌门店',
    category: '主材',
    unitPrice: 168,
    quantity: 55,
    daysBack: 14,
    purchaseUrl: 'https://www.marcopolotile.com/',
    remark: '客餐厅 + 走廊。色号 MB-G2305。图片占位。',
  },
  {
    stage: '瓦工',
    nodeName: '瓷砖采购',
    name: '蒙娜丽莎 厨卫墙砖',
    spec: '300x600mm 哑光白',
    brand: '蒙娜丽莎',
    channel: '品牌门店',
    category: '主材',
    unitPrice: 38,
    quantity: 90,
    daysBack: 14,
    purchaseUrl: 'https://www.monalisa.com.cn/',
    remark: '两卫 + 厨房墙面。',
  },
  {
    stage: '瓦工',
    nodeName: '瓷砖采购',
    name: '蒙娜丽莎 卫生间地砖',
    spec: '300x300mm 防滑灰',
    brand: '蒙娜丽莎',
    channel: '品牌门店',
    category: '主材',
    unitPrice: 22,
    quantity: 30,
    daysBack: 14,
    remark: '两卫地面，R10 防滑。',
  },
  {
    stage: '瓦工',
    nodeName: '瓷砖采购',
    name: '德高 瓷砖胶 + 美缝',
    spec: 'TTB-Ⅰ 普通型 + 环氧彩砂',
    brand: '德高',
    channel: '京东',
    category: '辅材',
    unitPrice: 95,
    quantity: 10,
    daysBack: 12,
    purchaseUrl: 'https://item.jd.com/100012345690.html',
  },
  {
    stage: '瓦工',
    nodeName: '过门石',
    name: '过门石 大理石条',
    spec: '900x150mm 米黄',
    brand: '本地石材',
    channel: '建材市场',
    category: '主材',
    unitPrice: 85,
    quantity: 5,
    daysBack: 10,
  },
  {
    stage: '瓦工',
    nodeName: '蹲坑',
    name: '潜水艇 深水封地漏',
    spec: 'TD8-10P',
    brand: '潜水艇',
    channel: '天猫',
    category: '五金',
    unitPrice: 78,
    quantity: 4,
    daysBack: 10,
    purchaseUrl: 'https://detail.tmall.com/item.htm?id=600000020',
  },
  {
    stage: '瓦工',
    nodeName: '蹲坑',
    name: '油烟机止逆阀',
    spec: '160mm',
    brand: '潜水艇',
    channel: '天猫',
    category: '五金',
    unitPrice: 60,
    quantity: 1,
    daysBack: 10,
  },
  {
    stage: '瓦工',
    nodeName: '瓷砖采购',
    name: '瓦工人工费 第一期',
    brand: '王师傅工地',
    channel: '工长',
    category: '工程',
    unitPrice: 5500,
    quantity: 1,
    daysBack: 3,
    remark: '瓷砖铺贴 50% 进度款。',
  },
  {
    stage: '安装',
    nodeName: '卫浴',
    name: '汉斯格雅 花洒套装',
    spec: 'Crometta 顶喷 + 手持',
    brand: '汉斯格雅',
    channel: '京东自营',
    category: '主材',
    unitPrice: 2580,
    quantity: 2,
    daysBack: 18,
    purchaseUrl: 'https://item.jd.com/100012345700.html',
    remark: '主卫 + 次卫，已到货。图片占位。',
  },
  {
    stage: '安装',
    nodeName: '卫浴',
    name: 'TOTO 智能马桶（定金）',
    spec: 'CES6601 一体式',
    brand: 'TOTO',
    channel: '京东自营',
    category: '主材',
    unitPrice: 4280,
    quantity: 1,
    daysBack: 18,
    purchaseUrl: 'https://item.jd.com/100012345701.html',
    remark: '主卫，坑距 305mm。次卫还没下单。',
  },
  {
    stage: '安装',
    nodeName: '灯具',
    name: '欧普 LED 吸顶灯',
    spec: '客厅 90W 调光调色',
    brand: '欧普',
    channel: '天猫',
    category: '主材',
    unitPrice: 680,
    quantity: 1,
    daysBack: 8,
    purchaseUrl: 'https://detail.tmall.com/item.htm?id=600000050',
    remark: '客厅主灯。',
  },
  {
    stage: '安装',
    nodeName: '灯具',
    name: '欧普 LED 卧室灯',
    spec: '40W 三色',
    brand: '欧普',
    channel: '天猫',
    category: '主材',
    unitPrice: 380,
    quantity: 2,
    daysBack: 8,
    purchaseUrl: 'https://detail.tmall.com/item.htm?id=600000051',
    remark: '主卧 + 次卧。',
  },
  {
    stage: '安装',
    nodeName: '木门',
    name: 'TATA 木门（定金 1 樘）',
    spec: '原木色 平开',
    brand: 'TATA',
    channel: '品牌门店',
    category: '主材',
    unitPrice: 2280,
    quantity: 1,
    daysBack: 22,
    purchaseUrl: 'https://www.tatamumen.com/',
    remark: '先下 1 樘，复尺后批量。',
  },
  {
    stage: '安装',
    nodeName: '五金',
    name: '海蒂诗 抽屉静音导轨',
    spec: '450mm',
    brand: '海蒂诗 Hettich',
    channel: '天猫',
    category: '五金',
    unitPrice: 65,
    quantity: 16,
    daysBack: 15,
    purchaseUrl: 'https://detail.tmall.com/item.htm?id=600000070',
  },
  {
    stage: '安装',
    nodeName: '橱柜',
    name: '索菲亚 整体橱柜（定金）',
    spec: 'L 型 含台面',
    brand: '索菲亚',
    channel: '品牌门店',
    category: '主材',
    unitPrice: 5000,
    quantity: 1,
    daysBack: 25,
    purchaseUrl: 'https://www.suofeiya.com/',
    remark: '50% 定金，5/3 复尺。',
  },
  {
    stage: '软装家电',
    nodeName: '大家电',
    name: '西门子 嵌入式洗碗机（定金）',
    spec: 'SJ43HX00MC 13 套',
    brand: '西门子',
    channel: '京东自营',
    category: '家电',
    unitPrice: 1500,
    quantity: 1,
    daysBack: 7,
    purchaseUrl: 'https://item.jd.com/100012345800.html',
    remark: '预订定金，橱柜进场前到货。',
  },
]

function checklistDoneRatio(stage: string): number {
  if (DONE_STAGES.has(stage)) return 1.0
  if (DOING_STAGES.has(stage)) return 0.5
  return 0
}

export interface DemoSeedResult {
  project: Project
  nodeCount: number
  purchaseCount: number
  totalSpent: number
}

export async function loadDemoProject(): Promise<DemoSeedResult> {
  const today = dayjs()
  const startDate = today.subtract(60, 'day').format('YYYY-MM-DD')
  const expectedEndDate = today.add(60, 'day').format('YYYY-MM-DD')

  const project: Project = {
    id: uid('proj'),
    name: '示范家 · 89㎡',
    address: '上海市闵行区 示范花园 12-3-301',
    area: 89,
    type: '毛坯',
    startDate,
    expectedEndDate,
    createdAt: new Date().toISOString(),
  }

  const schedule = buildStageSchedule(startDate)
  const nodes: DecorNode[] = []
  let order = 0
  for (const stage of STAGE_TEMPLATES) {
    const range = schedule[stage.stage]
    for (const tpl of stage.nodes) {
      const status = nodeStatusFor(stage.stage)
      const ratio = checklistDoneRatio(stage.stage)
      const checklist = tpl.checklist.map((text, idx) => ({
        id: uid('chk'),
        text,
        // done 全勾，doing 按比例从前往后勾一半
        done: status === 'done' ? true : idx < Math.floor(tpl.checklist.length * ratio),
      }))
      const node: DecorNode = {
        id: uid('node'),
        projectId: project.id,
        stage: stage.stage,
        name: tpl.name,
        order: order++,
        status,
        plannedStart: range?.plannedStart,
        plannedEnd: range?.plannedEnd,
        actualStart: range?.actualStart,
        actualEnd: range?.actualEnd,
        tips: tpl.tips.map((t) => `- ${t}`).join('\n'),
        tipsModified: false,
        checklist,
        notes: NODE_NOTES[tpl.name] ?? (status === 'todo' ? '' : '进行中，按计划推进。图片占位。'),
      }
      nodes.push(node)
    }
  }

  // 采购：把 SEED_PURCHASES 按 stage + 模糊 name 匹配到对应 node
  const purchases: Purchase[] = []
  for (const sp of SEED_PURCHASES) {
    const nodeId = pickNodeId(nodes, sp.stage, sp.nodeName)
    if (!nodeId) continue
    const total = Math.round(sp.unitPrice * sp.quantity * 100) / 100
    const purchaseDate = today.subtract(sp.daysBack, 'day').format('YYYY-MM-DD')
    purchases.push({
      id: uid('pur'),
      projectId: project.id,
      nodeId,
      name: sp.name,
      spec: sp.spec,
      brand: sp.brand,
      channel: sp.channel,
      category: sp.category,
      unitPrice: sp.unitPrice,
      quantity: sp.quantity,
      totalPrice: total,
      purchaseDate,
      purchaseUrl: sp.purchaseUrl,
      imageIds: [],
      remark: sp.remark,
      createdAt: today.subtract(sp.daysBack, 'day').toISOString(),
    })
  }

  await db.transaction('rw', db.projects, db.nodes, db.purchases, async () => {
    await db.projects.add(project)
    await db.nodes.bulkAdd(nodes)
    await db.purchases.bulkAdd(purchases)
  })

  const totalSpent = purchases.reduce((s, p) => s + p.totalPrice, 0)
  return {
    project,
    nodeCount: nodes.length,
    purchaseCount: purchases.length,
    totalSpent,
  }
}

/**
 * 清空所有数据 —— 危险操作。删除全部项目、节点、采购、图片、提醒。
 */
export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.projects, db.nodes, db.purchases, db.assets, db.reminders],
    async () => {
      await Promise.all([
        db.projects.clear(),
        db.nodes.clear(),
        db.purchases.clear(),
        db.assets.clear(),
        db.reminders.clear(),
      ])
    },
  )
}
