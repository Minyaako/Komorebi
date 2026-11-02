# 木漏日 · Komorebi 1.0

面向 Galgame 与同人游戏的 Windows 游戏管理器，基于 **[NextMoe API](https://developer.nextmoe.dev/docs) 与 [LetsMoe（LetMoe·一启萌）](https://www.letmoe.com/)** 提供作品资料、搜索及资源服务。

木漏日是独立第三方客户端，与 NextMoe、LetsMoe 无官方隶属关系。感谢平台及资源贡献者；作品资料、图像和游戏资源的权利归各自权利人。发行包不包含游戏资源、用户账号或共享密钥。

**[下载安装包与便携版](https://github.com/Minyaako/Komorebi/releases/latest)**

## 运行与后台

解压完整发行包后运行 `Komorebi.exe`，无需安装 Node.js。请保留程序旁的 resources、locales 和 DLL 文件。当前发行包未签名。

关闭主窗口默认隐藏到系统托盘，下载、网盘目录监听和游戏计时继续运行。单击托盘图标或再次启动程序可恢复窗口。右键托盘选择「退出木漏日」，或在设置中退出。设置可关闭后台运行。整理文件、官方上传或助手窗口尚未结束时，退出会提示先完成处理；游戏运行时会确认是否停止计时。正常退出会保存会话并暂停下载，下次启动可继续任务。

## 数据与游戏位置

配置、账号密文、网站会话、缓存、新上传包及默认下载目录统一保存在 `%APPDATA%\Komorebi`。设置提供「打开数据文件夹」。游戏库位置独立管理，可添加多个磁盘上的游戏库。

首次从旧源码目录或旧程序目录启动新版时，会复制相邻 `data` 中的配置、密文与网站会话，保留原件。已有游戏和历史任务的文件位置保持不变，不会搬动大量游戏文件。新下载缓存切换到统一目录。目标目录已有库配置时不会覆盖。迁移前请正常退出旧版本，不要同时运行两个不同数据目录的版本。

不要删除旧 `data/library`、`data/downloads`、`data/uploads`：已有记录可能仍引用这些文件。应用数据目录包含私人记录和登录信息，不应随发行包分享。`KOMOREBI_DATA` 环境变量仅供隔离测试或显式使用其他数据目录。

## 作品与游戏库

- 商店综合搜索名称、标签及接口提供的会社、staff、系列信息；支持标签包含/排除、成人内容设置、直链筛选与连续加载。
- 作品详情展示简介、资源、评分和相关系列，可直接入库而不下载；会社、staff、标签支持进一步浏览。
- 游戏库支持主题详情、封面网格和拼贴；状态下拉筛选与综合库搜索。收藏集按分组展示，右键游戏 → 移入收藏集 → 选择已有收藏集或输入新名称。
- 扫描本地游戏文件夹，搜索匹配作品并保留原位置。支持评分、笔记、游玩状态、游戏时长与活动热力图。
- 移出库仅删除记录；彻底删除游戏会另行确认文件位置。启动游戏不弹路径确认。

## 下载、网盘与上传

直链下载使用 aria2，支持暂停、继续和重试。完成后由 7-Zip 校验、解压并入库；失败后保留任务，可补填密码重试。多启动程序的游戏需先选择 EXE。

网盘监听只处理启用监听后出现并稳定的压缩包，完成后移动到选定游戏库的 `.archives` 下，提示并标记「待操作」，不自动解压。可自行整理或通过导入压缩包处理。

上传入口自动准备游戏目录压缩包，可排除存档目录和正则匹配的路径。文件名使用游戏名，包内 `komorebi.json` 记录公开提交信息和相对启动路径，不含账号或本机绝对路径。官方助手可填写投稿、选择准备好的文件并在上传完成后提交；需要网站登录时会显示窗口。网站会话与应用 OAuth 分别保存。任务中断后不会自动重复投稿。

## 账号与个人密钥

设置中登录 NextMoe，使用 OAuth PKCE；应用不包含 Client Secret。个人资源访问密钥需在官方控制台申领并在设置验证保存，不提供共享密钥。凭据使用 Windows DPAPI 经 Electron safeStorage 加密，不能直接复制给其他 Windows 账号使用。

游戏计时跟踪由木漏日启动的游戏进程，退出木漏日后停止记录。记录可同步到当前账号；通过其他启动器派生的游戏进程可能需要选择实际游戏 EXE。

## 源码开发

需要 Windows x64 与 Node.js 22 或更新版本。`npm ci` 安装依赖，`npm start` 启动；`npm test` 运行功能回归，`npm run test:ui` 验证收藏集和下载返回，`node scripts/background-test.cjs` 验证后台及单实例。`npm run package` 生成新的版本目录，拒绝覆盖已有发行目录。

## 第三方组件与资料

- Electron 45.1.0，MIT；发行包保留 LICENSE 与 Chromium notices：https://github.com/electron/electron
- aria2 1.37.0，GPL-2.0-or-later；tools 中保留许可，源代码：https://github.com/aria2/aria2/releases/tag/release-1.37.0
- 7-Zip 26.05，LGPL 与 unRAR 限制等，见 tools/7zip/License.txt；源代码：https://github.com/ip7z/7zip/releases/tag/26.05
- Marked、DOMPurify 的许可随 src/ui/vendor 保留。
- 作品资料来源 NextMoe / LetMoe / 鲲 Galgame 论坛及其标注的评分来源；作品图像归各权利人所有。官方 API 文档：https://developer.nextmoe.dev/docs

木漏日与以上平台无官方隶属关系。

## Windows 安装包

运行 `Komorebi-1.0.0-Setup-x64.exe`，使用中文向导选择安装位置。默认安装到当前用户，创建开始菜单「木漏日 Komorebi」和「卸载木漏日」，不额外创建桌面快捷方式。安装版和便携版共用 `%APPDATA%\Komorebi`。更新或卸载当前正在运行的安装目录时，会要求先通过托盘正常退出；卸载保留应用数据和游戏文件。

构建安装包：先生成对应版本便携目录，再运行 `npm run package:installer`。NSIS 配置位于 electron-builder.json，定制安装/卸载逻辑在 build/installer.nsh。当前安装包未签名。


仓库中仅提交源码、隔离测试及带许可证的运行工具。`data/`、环境文件、账号会话、历史实机验证脚本与生成的安装包均由 `.gitignore` 排除。发布前运行 `node scripts/audit-release.cjs` 检查 Git 暂存内容。第三方组件说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
