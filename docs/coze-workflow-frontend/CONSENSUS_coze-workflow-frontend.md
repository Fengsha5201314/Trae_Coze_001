# CONSENSUS — Coze 工作流前端调用器（coze-workflow-frontend）

## 1. 明确需求与验收
- 5 输入参数：api_token、workflow_id、input、feishu_token（可选）、num（1~10）。
- UI：酷炫真实图片背景、清晰布局、作者信息展示位（作者：风沙 微信：Love_Gws_1314）。
- 交互：执行时有明显状态提示与加载态；完成后可复制结果。
- API：使用个人令牌 Bearer 认证，直连 `https://api.coze.cn/v1/workflow/stream_run` 以 SSE 方式获取流式结果。参考概览/认证 <mcreference link="https://coze.cn/docs/developer_guides/coze_api_overview" index="2">2</mcreference> <mcreference link="https://coze.cn/docs/developer_guides/authentication" index="3">3</mcreference>
- 浏览器兼容：Chrome/Edge 最新版；移动端基础可用。

## 2. 技术实现与约束
- 仅前端（HTML/CSS/JS），不引入构建链路；JS 使用 fetch + ReadableStream 解析 SSE。
- 宽容解析策略：仅以 { 或 [ 开头的 data 段尝试 JSON.parse，避免非 JSON 段报错；尾部兜底解析。
- 安全：Token 不持久化、不日志输出；通过内存变量使用。
- 错误处理：请求失败/网络异常/解析异常均提示用户，按钮状态恢复。

## 3. 集成与接口契约
- 请求：
  - POST https://api.coze.cn/v1/workflow/stream_run
  - Headers：Authorization: Bearer <token>；Content-Type: application/json；Accept: text/event-stream
  - Body：{"workflow_id":"...","parameters":{"input":"...","NUM":2,"feishu_token":"..."}}
- 响应：SSE 流，事件名可为 message/自定义，data 为 JSON 或其他文本。
- 结果提取：优先使用包含 event 为工作流结束或带有 output/data/content 字段的 JSON 片段作为最终结果。

## 4. 边界与风控
- 若出现 CORS/SSE 不可用，将在后续补充一个简单代理服务（可选）。
- 若官方接口域名/路径变更，以用户提供样例为准，界面配置化便于切换。

## 5. 验收清单（Done Definition）
- 表单校验与范围限制完整。
- 执行期间明确状态与可视化加载效果。
- 成功/失败都能给出明确反馈。
- 结果展示字段覆盖：处理结果、Feishu 链接、调试链接、执行信息。
- 复制结果功能可用。
