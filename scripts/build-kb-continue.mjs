/**
 * FBIF 知识库构建 - 续接脚本
 * 从展会年鉴字段开始，创建嘉宾库和企业库
 */

const APP_ID = "cli_a85ba6a67abe5013";
const APP_SECRET = "a9c4Wpok2AGBOKZ4wlhacfUQ7Oc2b2Gn";
const APP_TOKEN = "J63zbS4YUaF78MsQEAdcSjOVnLg";
const BASE_URL = "https://open.feishu.cn/open-apis";

// Known table IDs from previous run
const YEARBOOK_TABLE = "tblZSqPYG0wktKUh";

let TOKEN = "";

async function getToken() {
  const res = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const data = await res.json();
  TOKEN = data.tenant_access_token;
  console.log("Got token");
}

async function api(method, path, body) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Non-JSON: ${text}`); }
  if (data.code !== 0) {
    console.error(`API Error [${path}]:`, data.msg, data.error?.log_id || "");
    throw new Error(data.msg);
  }
  return data.data;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function addField(tableId, field) {
  try {
    await api("POST", `/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/fields`, field);
    await sleep(150);
  } catch (e) {
    console.log(`  skip field "${field.field_name}": ${e.message}`);
  }
}

async function batchCreate(tableId, records) {
  const batchSize = 100;
  let created = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await api("POST", `/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records/batch_create`, { records: batch });
    created += batch.length;
    console.log(`  ${created}/${records.length} records`);
    await sleep(200);
  }
}

async function main() {
  await getToken();

  // ===== 展会年鉴: add fields and data =====
  console.log("\n=== 展会年鉴: adding fields ===");
  const ybFields = [
    { field_name: "年份", type: 2 },
    { field_name: "主题", type: 1 },
    { field_name: "英文主题", type: 1 },
    { field_name: "举办时间", type: 1 },
    { field_name: "地点", type: 1 },
    { field_name: "参会人数", type: 2 },
    { field_name: "展商数量", type: 2 },
    { field_name: "嘉宾数量", type: 2 },
    { field_name: "展览面积(㎡)", type: 2 },
    { field_name: "论坛结构", type: 1 },
    { field_name: "亮点", type: 1 },
  ];

  // Rename default field to 届数
  const existFields = await api("GET", `/bitable/v1/apps/${APP_TOKEN}/tables/${YEARBOOK_TABLE}/fields`);
  const firstF = existFields.items[0];
  await api("PUT", `/bitable/v1/apps/${APP_TOKEN}/tables/${YEARBOOK_TABLE}/fields/${firstF.field_id}`, {
    field_name: "届数", type: 2
  });

  for (const f of ybFields) await addField(YEARBOOK_TABLE, f);

  console.log("=== 展会年鉴: adding data ===");
  const ybData = [
    { fields: { 届数: 1, 年份: 2014, 主题: "—", 举办时间: "5月14-16日", 地点: "上海浦东星河湾酒店", 亮点: "FBIF创立" } },
    { fields: { 届数: 2, 年份: 2015, 主题: "—", 举办时间: "5月13-15日", 地点: "上海浦东星河湾酒店", 参会人数: 500, 亮点: "规模扩大至近500人" } },
    { fields: { 届数: 3, 年份: 2016, 主题: "放缓之下，转型之机", 举办时间: "4月20-22日", 地点: "上海龙之梦大酒店", 参会人数: 900, 亮点: "首次设定年度主题" } },
    { fields: { 届数: 4, 年份: 2017, 主题: "全球力量，领变未来", 举办时间: "4月19-21日", 地点: "上海元一希尔顿酒店", 参会人数: 1350, 亮点: "参会人数突破千人" } },
    { fields: { 届数: 5, 年份: 2018, 主题: "新品类崛起", 举办时间: "4月18-20日", 地点: "上海宝华万豪酒店", 参会人数: 2000, 亮点: "Foodtalks沙龙同年创立" } },
    { fields: { 届数: 6, 年份: 2019, 主题: "启动开放式创新，重获增长势能", 举办时间: "4月23-25日", 地点: "杭州国际博览中心", 参会人数: 4438, 展商数量: 200, 嘉宾数量: 120, 亮点: "首次迁至大型会展中心" } },
    { fields: { 届数: 7, 年份: 2020, 主题: "科技·颠覆", 英文主题: "Tech · Disruption", 举办时间: "7月8-10日", 地点: "杭州国际博览中心", 参会人数: 6800, 展商数量: 200, 嘉宾数量: 200, 亮点: "疫情下延期至7月举办" } },
    { fields: { 届数: 8, 年份: 2021, 主题: "探索新增量", 举办时间: "6月30日-7月2日", 地点: "杭州国际博览中心", 参会人数: 12000, 展商数量: 370, 亮点: "参会人数突破万人" } },
    { fields: { 届数: 9, 年份: 2023, 主题: "再造奇迹", 举办时间: "6月14-16日", 地点: "深圳国际会展中心（宝安）", 参会人数: 30000, 展商数量: 900, 嘉宾数量: 300, 亮点: "疫情后首届；迁至深圳" } },
    { fields: { 届数: 10, 年份: 2024, 主题: "破卷出新", 举办时间: "6月25-27日", 地点: "国家会展中心（上海）", 参会人数: 47000, 展商数量: 900, 嘉宾数量: 270, 亮点: "观众规模创历史新高" } },
    { fields: { 届数: 11, 年份: 2025, 主题: "稳拓新域", 英文主题: "Nurture the Present, Venture Forward", 举办时间: "5月8-10日", 地点: "国家会展中心（上海）", 参会人数: 47000, 展商数量: 600, 嘉宾数量: 200, "展览面积(㎡)": 62000, 论坛结构: "全体大会+8大分论坛+展览+4大活动区", 亮点: "新增产品开发论坛；渠道对接会扩大3倍" } },
  ];
  await batchCreate(YEARBOOK_TABLE, ybData);

  // ===== 嘉宾库: create table =====
  console.log("\n=== 创建嘉宾库 ===");
  const spkData = await api("POST", `/bitable/v1/apps/${APP_TOKEN}/tables`, { table: { name: "嘉宾库" } });
  const spkTable = spkData.table_id;
  console.log(`  table: ${spkTable}`);

  // Rename default field
  const spkFields0 = await api("GET", `/bitable/v1/apps/${APP_TOKEN}/tables/${spkTable}/fields`);
  await api("PUT", `/bitable/v1/apps/${APP_TOKEN}/tables/${spkTable}/fields/${spkFields0.items[0].field_id}`, { field_name: "姓名", type: 1 });

  const spkFields = [
    { field_name: "英文名", type: 1 },
    { field_name: "公司", type: 1 },
    { field_name: "职位", type: 1 },
    { field_name: "参与年份", type: 4, property: { options: [{ name: "2025" }, { name: "2024" }, { name: "2023" }] } },
    { field_name: "演讲主题/分论坛", type: 1 },
  ];
  for (const f of spkFields) await addField(spkTable, f);

  console.log("=== 嘉宾库: adding data ===");
  const speakers = [
    { fields: { 姓名: "石军", 英文名: "Jim Shi", 公司: "麦当劳中国", 职位: "首席供应链官", 参与年份: ["2025"], "演讲主题/分论坛": "全体大会" } },
    { fields: { 姓名: "Mac El-Omari", 英文名: "Mac El-Omari", 公司: "前摩根大通亚太区投行；中国飞鹤", 职位: "前副主席；非执行董事", 参与年份: ["2025"], "演讲主题/分论坛": "全体大会" } },
    { fields: { 姓名: "赵春武", 公司: "华润啤酒", 职位: "总裁", 参与年份: ["2025"], "演讲主题/分论坛": "全体大会" } },
    { fields: { 姓名: "Iris Wang", 英文名: "Iris Wang", 公司: "百事亚太及大中华区", 职位: "战略、BD与风投负责人", 参与年份: ["2025"], "演讲主题/分论坛": "全体大会" } },
    { fields: { 姓名: "许可", 公司: "伊利集团", 职位: "副总裁", 参与年份: ["2025"], "演讲主题/分论坛": "全体大会" } },
    { fields: { 姓名: "Ahmad AR. BinDawood", 英文名: "Ahmad AR. BinDawood", 公司: "BinDawood Holding", 职位: "CEO兼董事", 参与年份: ["2025"], "演讲主题/分论坛": "全体大会" } },
    { fields: { 姓名: "胡亚军", 公司: "东鹏饮料", 职位: "副总裁", 参与年份: ["2025"], "演讲主题/分论坛": "全体大会" } },
    { fields: { 姓名: "张文中", 公司: "多点Dmall / 物美", 职位: "创始人", 参与年份: ["2025"], "演讲主题/分论坛": "全体大会" } },
    { fields: { 姓名: "王靖", 公司: "弘晖资本", 职位: "创始合伙人", 参与年份: ["2025"], "演讲主题/分论坛": "全体大会" } },
    { fields: { 姓名: "JJ博士", 英文名: "Dr. JJ", 公司: "正大集团", 职位: "CTO", 参与年份: ["2025"], "演讲主题/分论坛": "全体大会" } },
    { fields: { 姓名: "张瑞阁", 公司: "旺旺集团", 职位: "亚太区国际业务副总经理", 参与年份: ["2025"], "演讲主题/分论坛": "全体大会" } },
    { fields: { 姓名: "老大卫", 英文名: "David", 公司: "益普索（Ipsos）", 职位: "中国事业部群董事总经理", 参与年份: ["2025"], "演讲主题/分论坛": "乳品创新" } },
    { fields: { 姓名: "张晓阳", 公司: "伊利集团", 职位: "成人营养品事业部品牌总监", 参与年份: ["2025"], "演讲主题/分论坛": "乳品创新" } },
    { fields: { 姓名: "蒋士龙", 公司: "中国飞鹤", 职位: "首席科学家", 参与年份: ["2025"], "演讲主题/分论坛": "乳品创新" } },
    { fields: { 姓名: "王涛", 公司: "恒天然（Fonterra）", 职位: "大中华区食品安全质量总经理", 参与年份: ["2025"], "演讲主题/分论坛": "乳品创新" } },
    { fields: { 姓名: "王维", 公司: "兰格格草原酸奶", 职位: "营销总经理", 参与年份: ["2025"], "演讲主题/分论坛": "乳品创新" } },
    { fields: { 姓名: "阿部文明", 英文名: "Fumiaki Abe", 公司: "森永乳业", 职位: "执行董事兼研发部门负责人", 参与年份: ["2025"], "演讲主题/分论坛": "乳品创新" } },
    { fields: { 姓名: "宁一冰", 公司: "君乐宝", 职位: "研发中心营养研究院院长", 参与年份: ["2025"], "演讲主题/分论坛": "乳品创新" } },
    { fields: { 姓名: "毛跃建", 公司: "蒙牛集团", 职位: "微生态研发总经理", 参与年份: ["2025"], "演讲主题/分论坛": "乳品创新" } },
    { fields: { 姓名: "吴骏", 公司: "三顿半", 职位: "创始人兼CEO", 参与年份: ["2025"], "演讲主题/分论坛": "饮料创新" } },
    { fields: { 姓名: "张小琳", 公司: "轻上", 职位: "总经理", 参与年份: ["2025"], "演讲主题/分论坛": "饮料创新" } },
    { fields: { 姓名: "高宫创平", 英文名: "Sohei Takamiya", 公司: "麒麟中国", 职位: "董事总经理", 参与年份: ["2025"], "演讲主题/分论坛": "饮料创新" } },
    { fields: { 姓名: "闫凯境", 公司: "天士力大健康产业投资集团", 职位: "董事局主席", 参与年份: ["2025"], "演讲主题/分论坛": "饮料创新" } },
    { fields: { 姓名: "Tomas Grosch", 英文名: "Tomas Grosch", 公司: "HELL Energy", 职位: "董事总经理", 参与年份: ["2025"], "演讲主题/分论坛": "饮料创新" } },
    { fields: { 姓名: "马红帆", 公司: "金多多食品集团", 职位: "联合创始人", 参与年份: ["2025"], "演讲主题/分论坛": "零食与烘焙" } },
    { fields: { 姓名: "李健", 公司: "北京工商大学", 职位: "食品与健康学院副院长", 参与年份: ["2025"], "演讲主题/分论坛": "零食与烘焙" } },
  ];
  await batchCreate(spkTable, speakers);

  // ===== 企业库: create table =====
  console.log("\n=== 创建企业库 ===");
  const coData = await api("POST", `/bitable/v1/apps/${APP_TOKEN}/tables`, { table: { name: "企业库" } });
  const coTable = coData.table_id;
  console.log(`  table: ${coTable}`);

  const coFields0 = await api("GET", `/bitable/v1/apps/${APP_TOKEN}/tables/${coTable}/fields`);
  await api("PUT", `/bitable/v1/apps/${APP_TOKEN}/tables/${coTable}/fields/${coFields0.items[0].field_id}`, { field_name: "企业名称", type: 1 });

  const coFields = [
    { field_name: "类型", type: 3, property: { options: [{ name: "品牌方" }, { name: "供应链" }, { name: "渠道商" }, { name: "服务商" }, { name: "投资机构" }] } },
    { field_name: "参与方式", type: 4, property: { options: [{ name: "参展" }, { name: "参会" }, { name: "演讲" }, { name: "赞助" }] } },
    { field_name: "参与年份", type: 4, property: { options: [{ name: "2025" }, { name: "2024" }, { name: "2023" }] } },
    { field_name: "行业领域", type: 3, property: { options: [{ name: "乳品" }, { name: "饮料" }, { name: "零食/烘焙" }, { name: "调味品" }, { name: "方便食品" }, { name: "功能性食品" }, { name: "包装/设计" }, { name: "配料/原料" }, { name: "设备/技术" }, { name: "渠道/零售" }, { name: "综合" }, { name: "投资" }] } },
  ];
  for (const f of coFields) await addField(coTable, f);

  console.log("=== 企业库: adding data ===");
  const companies = [
    { fields: { 企业名称: "伊利集团", 类型: "品牌方", 参与方式: ["参展", "演讲"], 参与年份: ["2025"], 行业领域: "乳品" } },
    { fields: { 企业名称: "蒙牛集团", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "乳品" } },
    { fields: { 企业名称: "中国飞鹤", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "乳品" } },
    { fields: { 企业名称: "君乐宝", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "乳品" } },
    { fields: { 企业名称: "海河乳品", 类型: "品牌方", 参与方式: ["参展"], 参与年份: ["2025"], 行业领域: "乳品" } },
    { fields: { 企业名称: "兰格格草原酸奶", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "乳品" } },
    { fields: { 企业名称: "OATLY", 类型: "品牌方", 参与方式: ["参展"], 参与年份: ["2025"], 行业领域: "饮料" } },
    { fields: { 企业名称: "三顿半", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "饮料" } },
    { fields: { 企业名称: "东鹏饮料", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "饮料" } },
    { fields: { 企业名称: "轻上", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "饮料" } },
    { fields: { 企业名称: "华润啤酒", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "饮料" } },
    { fields: { 企业名称: "麒麟中国", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "饮料" } },
    { fields: { 企业名称: "HELL Energy", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "饮料" } },
    { fields: { 企业名称: "今麦郎", 类型: "品牌方", 参与方式: ["参展"], 参与年份: ["2025"], 行业领域: "方便食品" } },
    { fields: { 企业名称: "好想你", 类型: "品牌方", 参与方式: ["参展"], 参与年份: ["2025"], 行业领域: "零食/烘焙" } },
    { fields: { 企业名称: "好欢螺", 类型: "品牌方", 参与方式: ["参展"], 参与年份: ["2025"], 行业领域: "方便食品" } },
    { fields: { 企业名称: "虎邦辣酱", 类型: "品牌方", 参与方式: ["参展"], 参与年份: ["2025"], 行业领域: "调味品" } },
    { fields: { 企业名称: "果子熟了", 类型: "品牌方", 参与方式: ["参展"], 参与年份: ["2025"], 行业领域: "饮料" } },
    { fields: { 企业名称: "比比赞", 类型: "品牌方", 参与方式: ["参展"], 参与年份: ["2025"], 行业领域: "零食/烘焙" } },
    { fields: { 企业名称: "旺旺集团", 类型: "品牌方", 参与方式: ["参展", "演讲"], 参与年份: ["2025"], 行业领域: "综合" } },
    { fields: { 企业名称: "金多多食品集团", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "零食/烘焙" } },
    { fields: { 企业名称: "麦当劳中国", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "综合" } },
    { fields: { 企业名称: "百事", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "综合" } },
    { fields: { 企业名称: "正大集团", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "综合" } },
    { fields: { 企业名称: "天士力大健康", 类型: "品牌方", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "功能性食品" } },
    { fields: { 企业名称: "奇华顿（Givaudan）", 类型: "供应链", 参与方式: ["参展"], 参与年份: ["2025"], 行业领域: "配料/原料" } },
    { fields: { 企业名称: "利乐（Tetra Pak）", 类型: "供应链", 参与方式: ["参展"], 参与年份: ["2025"], 行业领域: "包装/设计" } },
    { fields: { 企业名称: "纽斯葆广赛", 类型: "供应链", 参与方式: ["参展"], 参与年份: ["2025"], 行业领域: "配料/原料" } },
    { fields: { 企业名称: "恒天然（Fonterra）", 类型: "供应链", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "乳品" } },
    { fields: { 企业名称: "森永乳业", 类型: "供应链", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "乳品" } },
    { fields: { 企业名称: "99大华", 类型: "渠道商", 参与方式: ["参会"], 参与年份: ["2025"], 行业领域: "渠道/零售" } },
    { fields: { 企业名称: "十足便利", 类型: "渠道商", 参与方式: ["参会"], 参与年份: ["2025"], 行业领域: "渠道/零售" } },
    { fields: { 企业名称: "山东银座", 类型: "渠道商", 参与方式: ["参会"], 参与年份: ["2025"], 行业领域: "渠道/零售" } },
    { fields: { 企业名称: "中石化易捷", 类型: "渠道商", 参与方式: ["参会"], 参与年份: ["2025"], 行业领域: "渠道/零售" } },
    { fields: { 企业名称: "一鸣真鲜奶吧", 类型: "渠道商", 参与方式: ["参会"], 参与年份: ["2025"], 行业领域: "渠道/零售" } },
    { fields: { 企业名称: "淘工厂", 类型: "渠道商", 参与方式: ["参会"], 参与年份: ["2025"], 行业领域: "渠道/零售" } },
    { fields: { 企业名称: "天猫超市", 类型: "渠道商", 参与方式: ["参会"], 参与年份: ["2025"], 行业领域: "渠道/零售" } },
    { fields: { 企业名称: "多点Dmall / 物美", 类型: "渠道商", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "渠道/零售" } },
    { fields: { 企业名称: "BinDawood Holding", 类型: "渠道商", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "渠道/零售" } },
    { fields: { 企业名称: "弘晖资本", 类型: "投资机构", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "投资" } },
    { fields: { 企业名称: "益普索（Ipsos）", 类型: "服务商", 参与方式: ["演讲"], 参与年份: ["2025"], 行业领域: "综合" } },
  ];
  await batchCreate(coTable, companies);

  console.log("\n🎉 知识库构建完成！");
  console.log(`  展会年鉴: ${ybData.length} 条`);
  console.log(`  嘉宾库: ${speakers.length} 条`);
  console.log(`  企业库: ${companies.length} 条`);
  console.log(`\n🔗 https://foodtalks.feishu.cn/base/${APP_TOKEN}`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
