# ALIGNMENT — Coze 工作流前端调用器（coze-workflow-frontend）

## 1. 项目上下文分析（现状）
- 技术栈：纯前端静态站点（HTML + CSS + 原生 JS），无打包、无后端。 
- 目录与关键文件：
  - index.html：页面结构与表单输入/结果展示、作者信息展示位。
  - styles.css：整站视觉与动效（渐变背景、玻璃态、按钮加载态等）。
  - script.js：SSE 流式解析、Coze API 调用、状态管理、表单校验与结果渲染。
- 业务目标：在浏览器端以 SSE 方式调用 Coze 工作流，并在执行过程中展示状态、最终展示结果；共 5 个输入参数（input、feishu_token、workflow_id、api_token、num）。

## 2. 需求理解与范围边界
- 需求要点
  1) 页面炫酷、有真实图片、布局合理，适当位置显示作者信息（作者：风沙 微信：Love_Gws_1314）。
  2) 前端直连 Coze API，使用个人令牌 Bearer 认证。参考文档：Coze API 概览与认证文档 <mcreference link="https://coze.cn/docs/developer_guides/coze_api_overview" index="2">2</mcreference> <mcreference link="https://coze.cn/docs/developer_guides/authentication" index="3">3</mcreference>
  3) 执行工作流时显示明确的执行中状态（避免长时间等待误以为卡住）。
  4) UI 风格可参考“图1”，API 测试界面参考“图2”（未提供原图时，以当前页面风格为基准迭代）。
  5) 输入参数：
     - api_token：个人令牌（从用户输入）
     - workflow_id：目标工作流 ID（从用户输入）
     - input：业务输入字符串（从用户输入）
     - feishu_token：可选 Feishu 链接（从用户输入）
     - num：数量（范围 1~10）
- 范围边界
  - 不引入后端代理（除非 CORS/SSE 受限再评估）。
  - 不做令牌持久化（默认不存储到 localStorage/sessionStorage）。
  - 不新增账号体系与登录。
  - 兼容桌面/移动端的响应式布局（基础级）。

## 3. 现有实现与差距
- UI 已具备：作者信息展示、酷炫背景、表单、执行按钮、结果区、加载态/状态条。
- 行为已具备：
  - SSE 容错解析（宽容处理非 JSON 片段；尾部兜底）。
  - 参数校验、状态提示、结果渲染、复制功能。
- 待对齐项：
  - API 域名与路径应与给定示例一致：`https://api.coze.cn/v1/workflow/stream_run`（当前代码中如存在 `.com` 或旧路径需切换）。
  - 浏览器直连 CORS 与 SSE 可用性需实测验证。

## 4. 智能决策与不确定点（需确认）
1) API 基础域名：默认采用用户提供的 `.cn` 域名与 `/v1/workflow/stream_run` 路径；若后续官方迁移/版本变化，再同步更新。参考概览/认证文档链接 <mcreference link="https://coze.cn/docs/developer_guides/coze_api_overview" index="2">2</mcreference> <mcreference link="https://coze.cn/docs/developer_guides/authentication" index="3">3</mcreference>
2) CORS/SSE 策略：若浏览器直连受限，是否允许临时加一层轻量代理（仅转发，不存储 Token）？
3) Token 存储策略：是否允许“仅本次会话内”临时记忆（Session Storage）？默认安全起见不存。
4) UI 参考图：图1/图2未提供源图，是否需要我基于描述进一步还原/加强视觉？

## 5. 初步答案与约定（建议）
- 使用 `.cn` 域名与 `/v1/workflow/stream_run`，以用户提供 cURL 为准（前端直连优先）。
- 令牌仅使用内存变量，不做持久化存储。
- 若直连失败（CORS/SSE），备用方案：提供可选开关，切换至后端代理（后续单独实现）。
- 视觉：在现有基础上保留真实图片背景与动效；后续可按反馈微调排版与对比度。

## 6. 验收标准（可测试）
- 输入未填时明确报错提示；执行时按钮进入加载态并显示状态文案。
- 请求以 SSE 流形式进行，流中片段可宽容解析；请求失败时展示错误信息。
- 成功后页面展示：处理结果、Feishu 链接、调试链接（如有）、执行信息，并支持复制。
- 作者信息固定展示在头部信息区，移动端不溢出。
- 兼容 Chrome/Edge 最新版；移动端基本可用。

## 7. 下一步
- 如无异议，进入 DESIGN（系统架构/接口契约）与实现计划；随后进行小步提交与联调。
