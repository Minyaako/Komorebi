# 第三方服务与组件

木漏日基于 [NextMoe API](https://developer.nextmoe.dev/docs) 和 [LetsMoe（LetMoe·一启萌）](https://www.letmoe.com/) 提供作品资料、检索、账号授权和资源服务。木漏日为独立第三方客户端，不代表平台官方。游戏、封面和资料归各自权利人；发行包不包含游戏文件。

| 组件 | 版本 | 许可与来源 |
| --- | --- | --- |
| Electron | 45.1.0 | MIT；发行目录 LICENSE、LICENSES.chromium.html；https://github.com/electron/electron |
| aria2 | 1.37.0 | GPL-2.0-or-later；tools/COPYING、LICENSE.OpenSSL；https://github.com/aria2/aria2/releases/tag/release-1.37.0 |
| 7-Zip | 26.05 | LGPL、unRAR 限制及 BSD，详见 tools/7zip/License.txt；https://github.com/ip7z/7zip/releases/tag/26.05 |
| Marked | 18.1.2 | MIT；src/ui/vendor/marked-LICENSE；https://github.com/markedjs/marked |
| DOMPurify | 3.4.17 | Apache-2.0 或 MPL-2.0；src/ui/vendor/dompurify-LICENSE；https://github.com/cure53/DOMPurify |

aria2 和 7-Zip 为未经修改的独立命令行工具。Release 同时提供其对应版本的上游源码压缩包；其他组件源码可在各上游项目按版本获取。各组件许可不因本仓库公开而改变。

源码中的 OAuth Client ID 是公开客户端标识，并非 Client Secret。每个用户的 OAuth 凭据及个人 API 密钥由本机加密保存，不包含在本仓库及发行包中。
