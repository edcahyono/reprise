export type Language = "en" | "zh";

export const translations: Record<string, string> = {
  "Source materials": "研究资料", "Read the study": "阅读研究", "Protocol & evidence": "方案与证据", "AI personas": "AI 模拟受访者", "Experiment run": "实验运行", "Results comparison": "结果比较",
  "Locked": "未开放", "Upload File": "上传文件", "Reading uploaded files": "正在读取文件", "All listed files are read together when you extract experiment rules.": "提取实验规则时，系统会同时读取列表中的所有文件。", "Remove file": "移除文件", "Remove": "移除", "MODEL / MODEL ID": "模型 / 模型编号", "MODE": "模式", "ID unavailable": "编号不可用", "Non-thinking": "普通模式", "Thinking": "思考模式", "Extract experiment rules": "提取实验规则", "Continue to study summary": "继续阅读研究摘要", "Source extraction": "资料提取", "Set the Paratera key and selected model ID in server settings.": "请在服务器设置中填写 Paratera 密钥和模型编号。",
  "Main paper": "主要论文", "Required": "必需", "Upload the study paper before extracting experiment rules.": "提取实验规则前，请上传研究论文。", "Upload main paper": "上传主要论文", "Replace main paper": "替换主要论文", "Additional resources": "补充资料", "Optional": "可选", "Add an appendix, questionnaire, or other supplementary material.": "可添加附录、问卷或其他补充资料。", "Upload additional resources": "上传补充资料", "Upload the main paper first.": "请先上传主要论文。", "A supplementary file cannot have the same name as the main paper.": "补充资料不能与主要论文同名。", "Main paper ready. Add supplementary resources if needed, then extract experiment rules.": "主要论文已就绪。可按需添加补充资料，然后提取实验规则。", "Supplementary resources ready. Extract experiment rules to use all listed files.": "补充资料已就绪。请提取实验规则以使用所有已列出的文件。", "Supplementary resources added. Select Recheck to search them with the paper.": "补充资料已添加。请选择“重新核对”，与论文一起检索。", "Appendix or supplementary resources": "附录或补充资料", "Upload missing material, then recheck the existing protocol against all sources.": "上传缺少的资料后，使用全部资料重新核对现有方案。", "Upload appendix / supplementary resources": "上传附录 / 补充资料",
  "A plain-language explanation of the paper will appear here after extraction.": "提取完成后，这里会显示论文的简明说明。", "Refresh study guide": "更新研究导读", "Create study guide": "生成研究导读", "Continue to protocol": "继续查看研究方案", "Source quote needs review": "原文引述需要核对",
  "Respondents": "受访者", "Conditions": "实验条件", "Assignment": "分组方式", "Wave gap": "两轮间隔", "Persona attributes": "模拟受访者属性", "Outcome rules": "结果计算规则", "Not found": "未找到", "Not stated": "未说明", "Questions and branching": "问题与跳转规则", "Extract the study to see respondents, conditions, questions, and rules here.": "提取研究资料后，这里会显示受访者、实验条件、问题和规则。",
  "What these checks mean": "检查结果说明", "Recheck": "重新核对", "Source recheck": "资料重新核对", "run blockers": "项运行障碍", "What the source search found": "资料检索结果", "Retrieved source passages": "检索到的原文段落", "Possible extraction error": "可能是提取错误", "Source detail may be missing": "资料细节需要核对", "Needs review": "需要核对", "Apply proposed repairs": "应用建议的修正", "Review the findings below. Add a source-backed correction where the extracted protocol is wrong; runner limitations do not need a paper correction.": "请核对以下发现。提取方案有误时，可依据原文修正；运行器功能限制无需修改论文。", "Checks needed to run": "运行前需处理的检查项", "Persona generation and the executable path have no blocking checks.": "模拟受访者生成和实验流程没有障碍。", "Review findings": "核对发现", "Advanced: view or edit extracted JSON": "高级选项：查看或编辑提取的 JSON", "The extracted protocol will appear here.": "提取的研究方案会显示在这里。", "Experiment protocol JSON": "实验方案 JSON", "Continue to AI personas": "继续生成 AI 模拟受访者",
  "Corrected detail": "修正内容", "Source file": "资料文件", "Exact supporting quote": "支持修正的原文", "Write the correct rule, amount, question wording, or assignment here.": "请填写正确的规则、金额、题目文字或分组方式。", "Paste a short phrase from the uploaded paper or appendix.": "请粘贴已上传论文或附录中的简短原文。", "Quote found in the uploaded source": "已在上传的资料中找到原文", "Quote not found in the selected source": "未在所选资料中找到原文", "Persona blocker": "分组障碍", "Run blocker": "运行障碍", "Study detail to verify": "研究细节待核对", "Citation to verify": "引文待核对", "Reconstruction to review": "重建方案待核对", "Runner limitation": "运行器功能限制", "This result is reported by the study, but Reprise cannot calculate it yet. No paper correction is needed.": "研究报告了这一结果，但 Reprise 尚无法计算。无需修改论文。",
  "NUMBER OF AI PERSONAS": "AI 模拟受访者数量", "Generate personas": "生成模拟受访者", "Assignment needs repair": "分组方式需要修正", "Export CSV for Excel": "导出 Excel 用 CSV", "Fields such as name, age, or gender appear only when the study provides usable values. Missing respondent details are left blank rather than invented.": "只有研究提供可用数据时，才显示姓名、年龄或性别等字段。缺少的受访者信息会留空。", "Previous": "上一页", "Next": "下一页", "Continue to experiment run": "继续运行实验",
  "Pause run": "暂停运行", "Experiment complete": "实验已完成", "Continue experiment": "继续实验", "Start exploratory pilot": "开始探索性试运行", "Start experiment": "开始实验", "The run needs valid question paths and wave timing. See the run blockers in Protocol & evidence.": "实验需要完整的问题路径和轮次时间。请查看方案与证据中的运行障碍。", "No interval is recorded for the later stage. It will run after the earlier stage finishes, without a scheduled delay.": "未记录后续阶段的时间间隔。前一阶段完成后将继续运行，不设置延迟。", "completed": "已完成", "generated": "已生成", "choices saved": "已保存选择", "Experiment progress": "实验进度", "See results comparison": "查看结果比较",
  "Measure": "指标", "AI result": "AI 结果", "Published": "论文结果", "Scored observations": "有效观测数", "Not extracted": "未提取", "Results will appear after the experiment runs.": "实验运行后，这里会显示结果。", "No executable outcome rule is available yet.": "目前没有可运行的结果计算规则。", "Choices in extracted task": "已提取任务中的选择", "Not directly comparable": "不能直接比较", "The paper provides no individual profiles for these personas. Repeated identical questions may produce identical AI choices.": "论文没有提供这些模拟受访者的个人资料。相同的问题可能让 AI 每次都做出相同选择。", "Partial result from the extracted choices. Confirm the full set of policies and periods before comparing with the published measure.": "这只是已提取选项的部分结果。比较论文结果前，请核对所有保单选项和实验轮次。", "Partial result from the extracted choices. This arm reused a question assigned to another condition; it cannot be compared with the published measure.": "这只是已提取选项的部分结果，而且该组重复使用了其他实验条件的问题，不能与论文结果直接比较。", "AI personas are synthetic respondents. Source gaps remain visible and block an exact mirror.": "AI 模拟受访者不是原研究的真实参与者。资料缺口会继续显示，并影响准确复现。",
  "Study guide ready.": "研究导读已生成。", "Source-backed repair applied. Review the remaining checks before continuing.": "已应用有资料依据的修正。请核对剩余检查项。", "A valid assignment plan is needed before generating personas.": "生成模拟受访者前，需要有效的分组方案。", "Complete the question paths and timing before running.": "运行前请补全问题路径和轮次时间。", "Configure a Paratera model on the server first.": "请先在服务器上设置 Paratera 模型。", "Run paused. Saved choices will be used when you resume.": "实验已暂停。继续运行时会使用已保存的选择。", "Selected personas finished. Compare the results below.": "所选模拟受访者已完成实验。请比较下方结果。", "Add the paper and questionnaire or appendix first.": "请先上传论文和问卷或附录。", "Add a correction to one of the issue cards first.": "请先在检查项中填写修正内容。", "Complete both the corrected detail and source quote in each started card.": "每个已填写的检查项都需要修正内容和资料原文。",
  "Workspace links": "工作区链接", "Experiment phases": "实验步骤", "Load failed": "加载失败", "This is a problem in the extracted question map. First compare it with the paper or questionnaire; it may be an AI extraction mistake.": "提取的问题路径可能有误。请先与论文或问卷核对；这也可能是 AI 提取错误。", "The paper's respondent count was not extracted; choose a declared AI sample size.": "未提取到论文中的受访者人数。请明确填写 AI 样本量。", "No usable assignment plan was extracted.": "未提取到可用的分组方案。", "Conditions or executable questions are missing.": "缺少实验条件或可运行的问题。", "No individual-level profile data were supplied; generated personas will have no sampled attributes.": "资料没有提供个人层面的属性数据。生成的模拟受访者不会包含抽样属性。", "No executable outcome calculations were extracted; choices can still be saved.": "未提取到可运行的结果计算方法，但仍可保存选择。", "The recorded gap between stages must be a nonnegative number of days.": "已记录的阶段间隔必须是非负天数。", "Choose between 1 and 10,000 personas.": "模拟受访者数量应为 1 到 10,000。",
  "Brown et al. randomized CV-Sell between wave 1 and wave 2; this protocol does not represent both placements.": "Brown 等人将 CV-Sell 随机安排在第 1 轮或第 2 轮；当前方案没有包含这两种安排。", "Brown's published correlations use log valuations adjusted for experimental manipulations; the runner's raw correlation is not directly comparable.": "Brown 论文中的相关系数使用经过实验因素调整的对数估值；当前运行结果中的原始相关系数不能直接比较。",
  "Persona ID": "模拟受访者编号", "Assigned arm": "分配组别", "Condition sequence": "实验条件顺序", "Median CV-Sell Valuation": "CV-Sell 估值中位数", "Mean Absolute Log Spread (Sell-Buy)": "卖出与买入估值的平均对数差绝对值", "Pearson Correlation CV-Sell vs CV-Buy": "CV-Sell 与 CV-Buy 的皮尔逊相关系数",
  "CV-Sell (Compensating Variation - Sell)": "CV-Sell（补偿变差，卖出）", "CV-Buy (Compensating Variation - Buy)": "CV-Buy（补偿变差，买入）", "EV-Sell (Equivalent Variation - Sell)": "EV-Sell（等价变差，卖出）", "EV-Buy (Equivalent Variation - Buy)": "EV-Buy（等价变差，买入）",
  "Simulated traits use reported aggregate statistics and an explicit distribution assumption, not original participant records.": "模拟属性根据论文的汇总统计和明确的分布假设生成，并非原参与者的数据。", "Live simulation: results update as choices are saved.": "模拟正在进行：保存选择后，结果会实时更新。",
  "Required study stages": "研究所需阶段", "decisions per arm": "项每组决策", "choices per decision": "个每项决策选项", "Scenario parameters and defaults": "情境参数与默认选项", "No parameters": "无参数", "Default": "默认选项", "None": "无",
  "No executable calculation for this published measure.": "这项论文指标尚无可执行的计算方法。",
  "This older extraction has no full-study coverage check. Re-extract the paper before running.": "旧版提取结果没有完整研究流程检查。请重新提取论文后再运行。", "Re-extract the uploaded paper to check every study stage before running.": "请重新提取已上传的论文，核对所有研究阶段后再运行。",
};

export function ui(language: Language, english: string): string {
  return language === "zh" ? translations[english] || english : english;
}

export function studyLabel(language: Language, value: string): string {
  if (language === "en") return value;
  if (translations[value]) return translations[value];
  return value.replace(/\bin Wave (\d+)\b/g, "在第 $1 轮").replace(/^Other Conditions/, "其他实验条件");
}

export function displayBusy(language: Language, value: string): string {
  if (language === "en") return value;
  const fixed: Record<string, string> = {
    "Reading sources": "正在读取资料", "Extracting source evidence": "正在提取资料证据", "Searching source passages": "正在检索资料段落", "Searching source passages with Voyage": "正在用 Voyage 检索资料段落", "Writing the study guide": "正在生成研究导读", "Rechecking source evidence": "正在重新核对资料证据", "Applying source corrections": "正在应用资料修正", "Running AI personas": "正在运行 AI 模拟受访者",
  };
  if (fixed[value]) return fixed[value];
  let match = value.match(/^Extracting (\d+) of (\d+) source sections$/);
  if (match) return `正在提取资料片段 ${match[1]} / ${match[2]}`;
  match = value.match(/^Running (.+): (.+), question (\d+)$/);
  if (match) return `正在运行 ${match[1]}：${match[2]}，第 ${match[3]} 题`;
  return value;
}

export function displayReading(language: Language, value: string): string {
  if (language === "en") return value;
  let match = value.match(/^Opening file (\d+) of (\d+)$/);
  if (match) return `正在打开文件 ${match[1]} / ${match[2]}`;
  match = value.match(/^File (\d+) of (\d+) · (.+)$/);
  if (match) return `文件 ${match[1]} / ${match[2]} · ${displayReading(language, match[3])}`;
  match = value.match(/^(.+): page (\d+) of (\d+)$/);
  if (match) return `${match[1]}：第 ${match[2]} / ${match[3]} 页`;
  match = value.match(/^Opening (.+)$/);
  if (match) return `正在打开 ${match[1]}`;
  match = value.match(/^(.+) ready$/);
  if (match) return `${match[1]} 已就绪`;
  return value;
}

export function displayAudit(language: Language, value: string): string {
  if (language === "en") {
    const detail = value.match(/^Source detail still needed: (.+)$/);
    if (detail) return detail[1];
    const quote = value.match(/^(.+) quote could not be verified in (.+)\.$/);
    if (quote) return `${quote[1]} citation did not match the extracted text from ${quote[2]}.`;
    return value;
  }
  if (translations[value]) return translations[value];
  const templates: [RegExp, (matches: RegExpMatchArray) => string][] = [
    [/^Source detail still needed: (.+)$/, (m) => m[1]],
    [/^(.+) has no source quote\.$/, (m) => `${m[1]} 缺少资料原文。`],
    [/^(.+) quote could not be verified in (.+)\.$/, (m) => `无法在 ${m[2]} 中核对 ${m[1]} 的原文。`],
    [/^Persona field (.+) needs usable values and weights\.$/, (m) => `模拟受访者属性 ${m[1]} 需要可用的取值和权重。`],
    [/^Arm (.+) needs a valid weight and condition order\.$/, (m) => `分组 ${m[1]} 需要有效的权重和实验条件顺序。`],
    [/^Arm (.+) repeats a condition; make repeated tasks separate conditions\.$/, (m) => `分组 ${m[1]} 重复使用同一实验条件。请将重复任务设为不同条件。`],
    [/^Arm (.+) places an earlier wave after a later wave\.$/, (m) => `分组 ${m[1]} 将较早轮次排在较晚轮次之后。`],
    [/^Condition (.+) has no entry question\.$/, (m) => `实验条件 ${m[1]} 缺少起始问题。`],
    [/^Condition (.+) has a routing loop\.$/, (m) => `实验条件 ${m[1]} 的问题跳转出现循环。`],
    [/^Condition (.+) has unreachable questions\.$/, (m) => `实验条件 ${m[1]} 有无法进入的问题。`],
    [/^Question (.+) needs a condition and 2 to 20 distinct choices\.$/, (m) => `问题 ${m[1]} 需要对应实验条件，以及 2 到 20 个不同选项。`],
    [/^Arm (.+) has (\d+) of (\d+) required decisions in stage (.+)\.$/, (m) => `分组 ${m[1]} 在阶段 ${m[4]} 只有 ${m[2]} / ${m[3]} 项必需决策。`],
    [/^Arm (.+) stage (.+) needs (\d+) choices per decision\.$/, (m) => `分组 ${m[1]} 的阶段 ${m[2]} 每项决策需要 ${m[3]} 个选项。`],
    [/^Arm (.+) stage (.+) has the wrong default choice\.$/, (m) => `分组 ${m[1]} 的阶段 ${m[2]} 默认选项不正确。`],
    [/^Condition (.+) is missing required parameter (.+)\.$/, (m) => `实验条件 ${m[1]} 缺少必需参数 ${m[2]}。`],
    [/^Missing executable study step: (.+)$/, (m) => `缺少可执行的研究步骤：${m[1]}`],
    [/^Question (.+) has an incomplete choice route\.$/, (m) => `问题 ${m[1]} 的选项跳转不完整。`],
    [/^Question (.+) routes into another condition\.$/, (m) => `问题 ${m[1]} 跳转到了其他实验条件。`],
    [/^Question (.+) has an incomplete valuation rule; its outcome cannot be scored\.$/, (m) => `问题 ${m[1]} 的估值规则不完整，无法计算结果。`],
  ];
  for (const [pattern, translate] of templates) { const match = value.match(pattern); if (match) return translate(match); }
  return value;
}

export function displayStatus(language: Language, value: string): string {
  if (language === "en") return value;
  if (translations[value]) return translations[value];
  let match = value.match(/^(\d+) source files? ready\. Add the questionnaire or appendix if available, then select Extract experiment rules\.$/);
  if (match) return `${match[1]} 份资料已就绪。如有问卷或附录，请先上传，再选择“提取实验规则”。`;
  match = value.match(/^(\d+) synthetic AI personas generated\. Review findings before interpreting their results\.$/);
  if (match) return `已生成 ${match[1]} 名 AI 模拟受访者。解释结果前请核对资料提醒。`;
  match = value.match(/^Current waves saved\. The next wave opens (.+)\.$/);
  if (match) return `当前轮次已保存。下一轮将于 ${match[1]} 开放。`;
  match = value.match(/^(\d+) source corrections? reprocessed\. The checks have been recalculated; review any items that remain\.$/);
  if (match) return `已重新处理 ${match[1]} 项资料修正。请核对剩余检查项。`;
  if (value === "Protocol and study guide ready. Review the audit before running the experiment.") return "研究方案和导读已生成。运行实验前请核对检查结果。";
  if (value.startsWith("Chinese study guide could not be generated:")) return "中文研究导读生成失败。请点击“生成中文研究导读”重试。";
  if (value.startsWith("Protocol ready. Study guide needs another try:")) return "研究方案已生成，但研究导读需要重试。";
  if (value.startsWith("Protocol ready. Source search found a proposal that reduces run blockers from ")) return "研究方案已生成。资料检索提出了减少运行障碍的修正建议，请在方案与证据中核对。";
  if (value.startsWith("Source search found a proposal that reduces run blockers from ")) return "资料检索提出了减少运行障碍的修正建议，请在下方核对。";
  return value;
}
