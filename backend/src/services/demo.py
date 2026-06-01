"""Demo project seeding.

Creates one full project for the current user:
  - 11 stages, 62 nodes — sourced from the same templates the frontend uses
    (``src/services/demo_templates.json``, exported from
    ``src/data/templates.ts``).
  - 30 purchases totalling roughly ¥70 000.
  - Schedule mirrors the frontend seed: ~120 day build, every node ``done``,
    every checklist item ticked, dates relative to "today".
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List

from src.models.base import ChecklistItem, Node, Project, Purchase, User

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


_TEMPLATES_PATH = Path(__file__).with_name("demo_templates.json")


def _load_templates() -> List[Dict[str, Any]]:
    with _TEMPLATES_PATH.open(encoding="utf-8") as f:
        return json.load(f)


# (stage_name, duration_days)
_STAGE_PLAN: List[tuple[str, int]] = [
    ("前期准备", 14),
    ("设计", 12),
    ("主体改造", 6),
    ("水电改造", 12),
    ("防水", 5),
    ("瓦工", 14),
    ("木工", 10),
    ("油工", 12),
    ("安装", 15),
    ("软装家电", 10),
    ("收尾", 7),
]


# Curated purchase list — 30 entries, total ~¥70k. (stage, node_name_keyword,
# purchase fields, days_back from today).
_DEMO_PURCHASES: List[Dict[str, Any]] = [
    {
        "stage": "前期准备",
        "node_kw": "房屋",
        "name": "验房师上门服务",
        "brand": "验房无忧",
        "channel": "本地",
        "category": "工程",
        "unit_price": 580.0,
        "quantity": 1,
        "days_back": 128,
    },
    {
        "stage": "前期准备",
        "node_kw": "量房",
        "name": "设计师量房费",
        "brand": "本地设计",
        "channel": "设计公司",
        "category": "工程",
        "unit_price": 300.0,
        "quantity": 1,
        "days_back": 126,
    },
    {
        "stage": "设计",
        "node_kw": "水电点位",
        "name": "水电点位深化设计",
        "brand": "本地设计",
        "channel": "设计公司",
        "category": "工程",
        "unit_price": 800.0,
        "quantity": 1,
        "days_back": 115,
    },
    {
        "stage": "主体改造",
        "node_kw": "拆墙",
        "name": "拆墙人工 + 砌墙",
        "brand": "王师傅施工队",
        "channel": "施工",
        "category": "人工",
        "unit_price": 2200.0,
        "quantity": 1,
        "days_back": 105,
    },
    {
        "stage": "主体改造",
        "node_kw": "门窗",
        "name": "断桥铝系统窗",
        "spec": "1.4mm 壁厚 / 5+12A+5",
        "brand": "皇派",
        "channel": "线下门店",
        "category": "门窗",
        "unit_price": 700.0,
        "quantity": 4,
        "days_back": 102,
    },
    {
        "stage": "水电改造",
        "node_kw": "水路",
        "name": "PPR 水管 + 配件",
        "spec": "DN25 / DN20",
        "brand": "日丰",
        "channel": "京东",
        "category": "建材",
        "unit_price": 50.0,
        "quantity": 40,
        "days_back": 95,
    },
    {
        "stage": "水电改造",
        "node_kw": "电路",
        "name": "电线 BV 单芯",
        "spec": "1.5 / 2.5 / 4mm²",
        "brand": "远东",
        "channel": "京东",
        "category": "建材",
        "unit_price": 280.0,
        "quantity": 5,
        "days_back": 94,
    },
    {
        "stage": "水电改造",
        "node_kw": "电路",
        "name": "电工人工",
        "brand": "王师傅施工队",
        "channel": "施工",
        "category": "人工",
        "unit_price": 3200.0,
        "quantity": 1,
        "days_back": 93,
    },
    {
        "stage": "水电改造",
        "node_kw": "中央空调",
        "name": "壁挂分体空调",
        "spec": "1.5p / 大 1p",
        "brand": "美的",
        "channel": "京东",
        "category": "家电",
        "unit_price": 1900.0,
        "quantity": 2,
        "days_back": 92,
    },
    {
        "stage": "防水",
        "node_kw": "厨卫",
        "name": "防水涂料 JS 三遍",
        "brand": "东方雨虹",
        "channel": "京东",
        "category": "建材",
        "unit_price": 320.0,
        "quantity": 3,
        "days_back": 85,
    },
    {
        "stage": "瓦工",
        "node_kw": "瓷砖采购",
        "name": "厨卫墙地砖",
        "spec": "300x600 / 600x600",
        "brand": "马可波罗",
        "channel": "线下门店",
        "category": "瓷砖",
        "unit_price": 55.0,
        "quantity": 50,
        "days_back": 80,
    },
    {
        "stage": "瓦工",
        "node_kw": "客餐厅",
        "name": "客餐厅大砖",
        "spec": "800x800 抛釉",
        "brand": "蒙娜丽莎",
        "channel": "线下门店",
        "category": "瓷砖",
        "unit_price": 75.0,
        "quantity": 40,
        "days_back": 78,
    },
    {
        "stage": "瓦工",
        "node_kw": "瓷砖采购",
        "name": "瓦工人工",
        "brand": "王师傅施工队",
        "channel": "施工",
        "category": "人工",
        "unit_price": 3600.0,
        "quantity": 1,
        "days_back": 72,
    },
    {
        "stage": "木工",
        "node_kw": "吊顶",
        "name": "石膏板 + 龙骨 + 辅料",
        "brand": "泰山石膏 / 杭萧",
        "channel": "本地建材城",
        "category": "建材",
        "unit_price": 2600.0,
        "quantity": 1,
        "days_back": 65,
    },
    {
        "stage": "油工",
        "node_kw": "乳胶漆",
        "name": "乳胶漆 1 底 2 面",
        "spec": "儿童漆 5L",
        "brand": "都芳",
        "channel": "京东",
        "category": "建材",
        "unit_price": 460.0,
        "quantity": 4,
        "days_back": 55,
    },
    {
        "stage": "油工",
        "node_kw": "美缝",
        "name": "环氧彩砂美缝施工",
        "brand": "雅缝",
        "channel": "本地",
        "category": "人工",
        "unit_price": 1500.0,
        "quantity": 1,
        "days_back": 48,
    },
    {
        "stage": "安装",
        "node_kw": "木门",
        "name": "TATA 木门 + 门套",
        "brand": "TATA",
        "channel": "品牌专卖",
        "category": "门窗",
        "unit_price": 1200.0,
        "quantity": 4,
        "days_back": 42,
    },
    {
        "stage": "安装",
        "node_kw": "地板",
        "name": "SPC 锁扣地板",
        "spec": "5mm 锁扣",
        "brand": "大自然",
        "channel": "线下门店",
        "category": "建材",
        "unit_price": 160.0,
        "quantity": 40,
        "days_back": 40,
    },
    {
        "stage": "安装",
        "node_kw": "橱柜",
        "name": "L 型橱柜 + 石英石台面",
        "brand": "索菲亚",
        "channel": "品牌专卖",
        "category": "定制",
        "unit_price": 4600.0,
        "quantity": 1,
        "days_back": 38,
    },
    {
        "stage": "安装",
        "node_kw": "卫浴",
        "name": "智能马桶",
        "brand": "TOTO",
        "channel": "天猫",
        "category": "卫浴",
        "unit_price": 2000.0,
        "quantity": 1,
        "days_back": 36,
    },
    {
        "stage": "安装",
        "node_kw": "卫浴",
        "name": "花洒 + 龙头套装",
        "brand": "汉斯格雅",
        "channel": "天猫",
        "category": "卫浴",
        "unit_price": 1400.0,
        "quantity": 2,
        "days_back": 36,
    },
    {
        "stage": "安装",
        "node_kw": "开关插座",
        "name": "开关插座面板全屋",
        "spec": "G28 系列",
        "brand": "公牛",
        "channel": "京东",
        "category": "电气",
        "unit_price": 32.0,
        "quantity": 36,
        "days_back": 33,
    },
    {
        "stage": "安装",
        "node_kw": "灯具",
        "name": "客厅吸顶灯",
        "spec": "90W 三色调光",
        "brand": "欧普",
        "channel": "京东",
        "category": "灯具",
        "unit_price": 680.0,
        "quantity": 1,
        "days_back": 32,
    },
    {
        "stage": "安装",
        "node_kw": "灯具",
        "name": "卧室吸顶灯",
        "spec": "40W",
        "brand": "欧普",
        "channel": "京东",
        "category": "灯具",
        "unit_price": 260.0,
        "quantity": 2,
        "days_back": 32,
    },
    {
        "stage": "安装",
        "node_kw": "集成吊顶",
        "name": "厨卫集成吊顶",
        "brand": "欧普",
        "channel": "线下门店",
        "category": "建材",
        "unit_price": 2400.0,
        "quantity": 1,
        "days_back": 30,
    },
    {
        "stage": "安装",
        "node_kw": "烟机",
        "name": "烟机灶具套装",
        "brand": "老板",
        "channel": "京东",
        "category": "家电",
        "unit_price": 2800.0,
        "quantity": 1,
        "days_back": 28,
    },
    {
        "stage": "安装",
        "node_kw": "衣柜",
        "name": "主卧 + 次卧衣柜",
        "brand": "索菲亚",
        "channel": "品牌专卖",
        "category": "定制",
        "unit_price": 2800.0,
        "quantity": 2,
        "days_back": 25,
    },
    {
        "stage": "安装",
        "node_kw": "窗帘",
        "name": "客厅 + 卧室窗帘",
        "brand": "本地窗帘店",
        "channel": "本地",
        "category": "软装",
        "unit_price": 1100.0,
        "quantity": 3,
        "days_back": 22,
    },
    {
        "stage": "软装家电",
        "node_kw": "沙发",
        "name": "布艺沙发 3 人位",
        "brand": "林氏家居",
        "channel": "天猫",
        "category": "家具",
        "unit_price": 3400.0,
        "quantity": 1,
        "days_back": 18,
    },
    {
        "stage": "软装家电",
        "node_kw": "床",
        "name": "乳胶弹簧床垫",
        "spec": "1.8x2.0m",
        "brand": "8H",
        "channel": "天猫",
        "category": "家具",
        "unit_price": 1800.0,
        "quantity": 1,
        "days_back": 16,
    },
    {
        "stage": "软装家电",
        "node_kw": "大家电",
        "name": "对开门冰箱",
        "spec": "540L",
        "brand": "海尔",
        "channel": "京东",
        "category": "家电",
        "unit_price": 2800.0,
        "quantity": 1,
        "days_back": 14,
    },
    {
        "stage": "收尾",
        "node_kw": "开荒",
        "name": "开荒保洁 3 人 6 小时",
        "brand": "本地家政",
        "channel": "本地",
        "category": "服务",
        "unit_price": 700.0,
        "quantity": 1,
        "days_back": 10,
    },
    {
        "stage": "收尾",
        "node_kw": "除甲醛",
        "name": "CMA 室内空气检测",
        "brand": "本地检测机构",
        "channel": "本地",
        "category": "服务",
        "unit_price": 900.0,
        "quantity": 1,
        "days_back": 8,
    },
]


_NODE_NOTES: Dict[str, str] = {
    "房屋验收": "收房当天验完，2 处空鼓画圈拍照存档，物业出具整改单复验通过。",
    "量房与户型分析": "设计师上门量房，自己复核误差 ≤ 2cm；承重墙 / 梁 / 风道全部红笔标记。",
    "风格定调": "现代简约 + 一点原木，主色蓝灰 + 米白，辅色胡桃木。",
    "水路改造": "水管走顶不走地，PPR DN25；冷热水间距 15cm；打压 0.8MPa 保压 30min 合格。",
    "电路改造": "强弱电分管 30cm，空调独立 4mm²，普通插座 2.5mm²。",
    "厨卫防水施工": "三遍涂 JS 防水；卫生间淋浴墙面返高 1.8m；闭水 48h 通过。",
    "美缝": "环氧彩砂；通风 24h；缝口干净均匀。",
    "开荒保洁": "全屋 3 人 6 小时；玻璃 / 地面 / 灯具 / 油烟机重点。",
}


def _pick_node_id(nodes_in_stage: List[Node], keyword: str | None) -> Node | None:
    if not nodes_in_stage:
        return None
    if keyword:
        for n in nodes_in_stage:
            if keyword in n.name:
                return n
    return nodes_in_stage[0]


async def load_demo_project(db: "AsyncSession", user: User) -> Dict[str, Any]:
    today = datetime.now(timezone.utc).date()
    templates = _load_templates()

    # Project: 130 days ago → 8 days ago
    start_date = today - timedelta(days=130)
    expected_end = today - timedelta(days=8)

    project = Project(
        user_id=user.id,
        name="示范家 · 89㎡",
        address="上海市闵行区 示范花园 12-3-301",
        area=89.0,
        type="毛坯",
        start_date=start_date,
        expected_end_date=expected_end,
    )
    db.add(project)
    await db.flush()  # we need project.id for FKs

    # Build the stage schedule, then create nodes + checklist items.
    cursor = start_date
    schedule: Dict[str, tuple[date, date, date, date]] = {}
    for stage_name, duration in _STAGE_PLAN:
        ps = cursor
        pe = cursor + timedelta(days=duration - 1)
        actual_end = cursor + timedelta(days=duration)  # 1 day late, like the frontend seed
        schedule[stage_name] = (ps, pe, ps, actual_end)
        cursor = cursor + timedelta(days=duration + 1)

    order = 0
    nodes_by_stage: Dict[str, List[Node]] = {}
    for stage in templates:
        stage_name = stage["stage"]
        ps, pe, a_s, a_e = schedule[stage_name]
        for tpl in stage["nodes"]:
            node = Node(
                project_id=project.id,
                stage=stage_name,
                name=tpl["name"],
                order=order,
                status="done",
                planned_start=ps,
                planned_end=pe,
                actual_start=a_s,
                actual_end=a_e,
                tips="\n".join(f"- {t}" for t in tpl["tips"]),
                tips_modified=False,
                notes=_NODE_NOTES.get(tpl["name"], "完工验收无异常。"),
            )
            db.add(node)
            await db.flush()
            for i, text in enumerate(tpl["checklist"]):
                db.add(ChecklistItem(node_id=node.id, text=text, done=True, order=i))
            nodes_by_stage.setdefault(stage_name, []).append(node)
            order += 1

    total_spent = 0.0
    purchase_count = 0
    for sp in _DEMO_PURCHASES:
        candidates = nodes_by_stage.get(sp["stage"], [])
        node = _pick_node_id(candidates, sp.get("node_kw"))
        node_id = node.id if node else None
        unit_price = float(sp["unit_price"])
        qty = float(sp["quantity"])
        total = round(unit_price * qty, 2)
        purchase_date = today - timedelta(days=int(sp["days_back"]))
        db.add(
            Purchase(
                project_id=project.id,
                node_id=node_id,
                name=sp["name"],
                spec=sp.get("spec"),
                brand=sp.get("brand"),
                channel=sp.get("channel"),
                category=sp.get("category", ""),
                unit_price=unit_price,
                quantity=qty,
                total_price=total,
                purchase_date=purchase_date,
                purchase_url=sp.get("purchase_url"),
                remark=sp.get("remark"),
            )
        )
        total_spent += total
        purchase_count += 1

    await db.commit()
    await db.refresh(project)

    node_count = sum(len(v) for v in nodes_by_stage.values())
    return {
        "project": project,
        "stats": {
            "stage_count": len(templates),
            "node_count": node_count,
            "purchase_count": purchase_count,
            "total_spent": round(total_spent, 2),
        },
    }
