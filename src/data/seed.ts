import dayjs from 'dayjs'
import { db } from '@/db'
import { STAGE_TEMPLATES } from '@/data/templates'
import { uid } from '@/lib/uid'
import type { DecorNode, Project, Purchase } from '@/types'

/**
 * 加载示例项目 —— 一套"已经装修完毕"的真实感全流程档案。
 * 业主点进任意节点都能看到完整的避坑、Checklist、采购、备注。
 * 不写死 id，每次调用生成新项目，不污染已有数据。
 */

// 62 个节点逐条施工笔记（key = 节点名，值 = notes）
const NODE_NOTES: Record<string, string> = {
  // 前期准备
  房屋验收: '收房当天验完，2 处空鼓画圈拍照存档，物业出具整改单 5/2 复验通过。',
  量房与户型分析: '设计师 4/1 上门量房，自己复核误差 ≤ 2cm；承重墙 / 梁 / 风道全部红笔标记。',
  风格定调:
    '定了"现代简约 + 一点原木"，主色蓝灰 + 米白，辅色胡桃木。家人各挑 3 张实景图，最后统一到一份 mood board。',
  '装修方式选择（全包/半包/清包）':
    '半包，主材自采；合同保留 10% 尾款；工期 75 天写入合同；增项需书面签字。',
  '装修公司/工长选择':
    '考察了 3 家工地，最后定王师傅。施工人员 4 人姓名 / 电话留存，分包项目分开签字。',
  总预算与资金计划:
    '总预算 18w，含 15% 应急。付款节点：开工 30% / 水电完工 30% / 木工完工 30% / 竣工 10%。',
  '物业手续 / 开工证': '4/8 拿到开工证，押金 3000，电梯贴保护板，垃圾每天统一搬到指定堆放点。',
  平面方案: '终稿 4/12，业主签字；动线模拟一遍生活流程，确认主灯与床中线对齐。',
  邻里沟通与施工告知:
    '4/7 走访上下左右四邻，告知函送达签收。楼下重点沟通闭水时间，留紧急联系电话。',

  // 设计
  水电点位图: '4/15 定点，插座 + 18 比合同多；强弱电分管间距 30cm；弱电盒留在玄关吊顶上方。',
  全屋定制方案: 'A 品牌 E0 板，5/2 第一次复尺，6/8 第二次复尺；柜门到顶设计。',
  灯光设计方案:
    '客 / 餐 / 卧分区控制，色温 3500K 统一；床头 / 镜前 / 衣柜内部补光全部纳入；智能网关位置定在玄关上方。',
  效果图与材料板:
    '关键空间效果图 3 张（客餐厅 / 主卧 / 主卫），材料样板 12 块带回家在自然光下复核色号。',
  主材清单确认:
    '瓷砖、卫浴、五金、木门 4/20 前下单；橱柜定金 4/22 付清；按工序节点倒推到货时间。',

  // 主体改造
  '拆墙 / 砌墙': '4/22 拆除完毕，承重墙没动；新砌 2 段轻体墙做拉结筋 + 顶部斜砖防开裂。',
  门窗拆改: '4/26 皇派系统窗装完，断桥铝 1.4mm 壁厚，5+12A+5 中空玻璃，密封条压紧无漏风。',
  垃圾清运: '4/22-4/28 一次清运 32 袋，单价 25/袋；危险废料（油漆桶）单独打包。',
  '包立管 / 隐藏管道':
    '厨卫立管用轻钢龙骨 + 隔音棉 + 双层石膏板，水流噪音明显降低；预留 350x350 检修口。',

  // 水电改造
  水路改造:
    '王师傅 5/18 到场，水管走顶不走地，PPR DN25；冷热水管间距 15cm；打压 0.8MPa 保压 30min 掉压 0.02MPa 合格。',
  电路改造:
    '5/19-22 走线，强弱电分管间距 30cm，空调独立 4mm²，普通插座 2.5mm²，照明 1.5mm²。',
  '中央空调 / 新风预埋':
    '5/16 大金中央空调内机就位；冷凝水坡度 2%；检修口 450x450；新风滤芯位置靠走廊吊顶检修口。',
  燃气管改造: '5/20 燃气公司施工，明装；阀门处可达；打压验收凭证已归档；表 / 灶 / 热水器走专用波纹管。',
  水电验收: '5/30 业主到场，水电图纸 + 实物逐一拍照；隐蔽工程验收单一式两份签字归档。',

  // 防水
  厨卫防水施工:
    '5/23-25 涂三遍东方雨虹 JS；卫生间墙面返高淋浴区 1.8m / 其他 30cm；阴阳角加网格布。',
  闭水试验: '5/28 闭水 48h，水位 4cm；楼下确认无渗漏并签字，全程视频留底。',
  '阳台 / 露台防水':
    '阳台按卫生间标准做防水；找坡 1.5% 朝地漏；推拉门下加挡水条防雨水倒灌。',

  // 瓦工
  瓷砖采购:
    '马可波罗 / 蒙娜丽莎；按面积加 8% 损耗下单；色号批次写入合同；5/15 全部到货验收。',
  厨卫墙地砖:
    '5/26-6/3 铺贴，瓦工 2 人；墙砖留 1.5mm 缝 / 地砖 2.5mm 缝；墙压地工艺；空鼓率 2%。',
  客餐厅地砖:
    '6/4-6/8 大砖 800x800 干铺，平整度 2m 靠尺误差 2mm，对缝精细。',
  '过门石 / 窗台石':
    '过门石米黄大理石 900x150；窗台石做滴水线；接缝处美缝处理。',
  '蹲坑 / 地漏 / 烟道':
    '潜水艇深水封地漏 4 个；烟道止逆阀 1 个；同层排水预留检修口。',
  '阳台 / 外墙瓷砖': '阳台干挂面砖，防滑系数 R10；与室内交界处做 8mm 高差挡水。',

  // 木工
  吊顶:
    '客厅吊顶 6cm 高度，厨卫集成铝扣板；石膏板拼缝 V 字槽 + 嵌缝带防开裂；灯带槽预留。',
  背景墙造型:
    '电视背景墙简约长板设计；拼缝牛皮纸防裂；挂电视位置加 18mm 多层板暗藏背板承重 60kg。',
  '现场打柜 / 隐形门':
    '玄关现场打柜（鞋柜 + 储物柜）；隐形门轻钢龙骨 + 双面石膏板与墙面齐平。',

  // 油工
  墙面找平:
    '原墙铲到水泥层，刷界面剂再批腻子；阴阳角用找直器，2m 靠尺误差 2mm。',
  刮腻子:
    '腻子刮 3 遍，每遍干透 24h；通体砂纸打磨；侧光灯下复检无凹凸。',
  乳胶漆:
    '都芳儿童漆 1 底 2 面，VOC < 30g/L；客餐厅米白 NCS S0500-N，卧室淡蓝；每色留备份漆 1L。',
  美缝:
    '环氧彩砂美缝；砖缝彻底清理后施工；通风 24h 防气味滞留。',

  // 安装
  '木门 / 门套': 'TATA 木门 5 樘，原木色平开；304 不锈钢三铰链；门吸位置避开燃气管。',
  地板:
    '主卧 / 次卧 SPC 锁扣地板，留 10mm 伸缩缝；铺防潮垫；与瓷砖交界处用同色 T 形扣条收口。',
  '橱柜 + 台面':
    '索菲亚 L 型橱柜 + 石英石台面 15mm；水槽下留维修空间；接缝防水胶处理；阻尼铰链 / 静音导轨。',
  卫浴洁具:
    'TOTO 智能马桶 + 汉斯格雅花洒 + 九牧台盆；坑距 305mm 复核无误；台盆下水与地漏分开走防反味。',
  开关插座面板:
    '公牛 G28 系列 42 个面板全屋统一；潮湿区用防水盒；螺丝全部拧紧。',
  灯具:
    '欧普 LED 客厅吸顶灯 90W + 卧室 40W 三色；色温 3500K 统一；分区控制；吊灯无（业主弃用）。',
  五金挂件:
    '凯鹰 304 不锈钢毛巾架 / 置物架 / 浴室柜五金；瓦工时预埋膨胀件位置。',
  集成吊顶:
    '欧普集成吊顶；浴霸 / 换气 / 照明三合一模块预留电源；油烟机管道吊顶前预埋。',
  '烟机灶具 / 热水器':
    '老板顶吸式烟机 + 燃气灶；史密斯燃气热水器；烟机距灶台 70cm；304 不锈钢烟管。',
  '衣柜 / 全屋定制':
    '索菲亚 3 件衣柜 + 书桌 + 玄关柜；业主现场监工，板材切口 / 缝隙 / 五金全部验收无异响。',
  窗帘:
    '客厅遮光罗马杆 + 卧室 100% 遮光布；电动窗帘预留电源。',
  晾衣架:
    '邦先生电动晾衣架，载重 35kg；阳台顶承重测试通过；电源预留就绪。',
  '净水 / 软水':
    '前置过滤器 + 厨下反渗透 + 软水机；废水接地漏；滤芯更换周期贴在设备旁。',
  '智能家居 / 网关':
    '米家网关在玄关上方；智能锁鹿客 P3；门窗传感器 / 烟感 / 水浸全部 PoE 供电；统一米家账号。',

  // 软装家电
  '沙发 / 茶几':
    '林氏家居布艺沙发 3+1 坐深 58cm；岩板茶几距沙发 35cm；抱枕 4 只点缀。',
  餐桌椅:
    '岩板餐桌 1.4m / 4 人；木质椅子 28cm 椅面高差；运输边角无破损。',
  '床 / 床垫':
    '8H 乳胶弹簧床垫，床架高度 35cm（总高 60cm）；试躺 20 分钟决定；床罩可拆洗。',
  '大家电（冰箱 / 洗碗机 / 烘干机）':
    '海尔 540L 对开门冰箱（散热间隙 8cm）；西门子 13 套嵌入式洗碗机；美的热泵烘干机；尺寸全部提前定。',
  '装饰画 / 绿植':
    '客厅 2 幅装饰画（沙发宽 2/3）；玄关琴叶榕 1 棵；窗台多肉 4 盆；挂钉 + 防滑垫防长期下滑。',

  // 收尾
  开荒保洁:
    '6/22 开荒保洁，3 人 6 小时；玻璃 / 地面 / 灯具 / 油烟机重点；灯下死角无遗漏。',
  除甲醛:
    '通风 3 个月 + 活性炭 + 新风；CMA 检测机构 6/30 检测，甲醛 0.07mg/m³ / TVOC 0.4mg/m³ 合格。',
  入住前检查:
    '7/5 水电气全部测试通过；保修单签订（基础工程 5 年防水）；钥匙 4 把 / 门禁 2 张清点。',
  保修归档:
    '所有发票 / 合同 / 保修卡扫描归档到云盘；维修联系电话本建立；保修到期前 1 个月再复检。',
}

interface StageDateRange {
  plannedStart: string
  plannedEnd: string
  actualStart: string
  actualEnd: string
}

function buildStageSchedule(startDate: string): Record<string, StageDateRange> {
  // 全部 done：每阶段有计划日期 + 实际日期（实际略晚 0-2 天）
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
    // 实际比计划晚 1 天结束，模拟真实施工节奏
    out[stage] = {
      plannedStart: ps,
      plannedEnd: pe,
      actualStart: ps,
      actualEnd: cursor.add(days, 'day').format('YYYY-MM-DD'),
    }
    cursor = cursor.add(days + 1, 'day') // 阶段间留 1 天衔接
  }
  return out
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
  daysBack: number
  purchaseUrl?: string
  remark?: string
}

import { SEED_PURCHASES } from './seedPurchases'

export interface DemoSeedResult {
  project: Project
  nodeCount: number
  purchaseCount: number
  totalSpent: number
}

export async function loadDemoProject(): Promise<DemoSeedResult> {
  const today = dayjs()
  // 完整 120 天施工档案：起始 130 天前 → 结束 8 天前
  const startDate = today.subtract(130, 'day').format('YYYY-MM-DD')
  const expectedEndDate = today.subtract(8, 'day').format('YYYY-MM-DD')

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
      // 全部 done，全部 checklist 勾完
      const checklist = tpl.checklist.map((text) => ({
        id: uid('chk'),
        text,
        done: true,
      }))
      const node: DecorNode = {
        id: uid('node'),
        projectId: project.id,
        stage: stage.stage,
        name: tpl.name,
        order: order++,
        status: 'done',
        plannedStart: range?.plannedStart,
        plannedEnd: range?.plannedEnd,
        actualStart: range?.actualStart,
        actualEnd: range?.actualEnd,
        tips: tpl.tips.map((t) => `- ${t}`).join('\n'),
        tipsModified: false,
        checklist,
        notes: NODE_NOTES[tpl.name] ?? '完工验收无异常。',
      }
      nodes.push(node)
    }
  }

  // 采购：按 stage + 模糊 name 匹配到对应 node
  // 找不到匹配的 node 时退到该 stage 第一个 node，保证每笔都能落地。
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

export type { SeedPurchase }

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
