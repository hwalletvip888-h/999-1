# 项目常驻指令(Claude 每次会话自动读取)

## 项目背景
- React Native + Expo 项目
- 使用 NativeWind / Tailwind 做样式
- 钱包类 App,涉及敏感数据,代码安全要求高

## Git 工作流(每次改动后自动执行)
1. 每完成一个功能改动或修复后,自动执行:
   - `git add .`
   - `git commit -m "<类型>: <简短中文描述>"`
   - `git push`
2. Commit message 使用 Conventional Commits 格式:
   - `feat:` 新功能
   - `fix:` 修复 Bug
   - `refactor:` 重构(不改变功能)
   - `style:` 样式调整
   - `chore:` 杂项(配置、依赖等)
   - `docs:` 文档
3. 推送到当前分支,不随便切换或新建分支
4. 推送前确认没有敏感信息(API key、私钥、助记词、`.env`)被加入暂存区
5. 遇到冲突或推送失败,立刻停下来告诉我,绝不使用 `git push --force`
6. 不要提交 `node_modules/`、`.expo/`、`dist/`、`build/`、`.env*`、日志文件

## 代码规则
- 改动前先读相关文件,理解上下文再动手
- 不删除我未提及的文件或功能
- 大改动(超过 3 个文件或涉及核心逻辑)先给计划,等我确认再执行
