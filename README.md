# 电池测试方式对比动画

SVG + JavaScript 实现的电池测试方式对比动画原型：

- **方式 1**：逐一充放电（人工逐个搬运电池到充放电机，仅能在 9:00–17:00 工作时间测试，**4 个电池需 4 天**）
- **方式 2**：级联充放电（4 线级联，能量依次流转，设备 24h 自动运行，**4 个电池仅需 1 天**）

每种方式右上角配有时钟，直观对比测试节奏：
- 方式 1 时钟：表盘 9–17 段高亮，每 8 秒动画对应 1 天工作时间（09:00 → 17:00），日期文字 `第 N/4 天`
- 方式 2 时钟：表盘整圈高亮，一个动画周期对应 24h 不间断测试，从当日 09:00 走到次日 09:00

![预览](battery-animation.gif)

## 文件结构

| 文件 | 用途 |
|------|------|
| `index.html` | 页面结构 + SVG 图形 |
| `style.css` | 样式 + 流光 / 数据流动画 |
| `script.js` | 动画逻辑 + 状态机 |
| `make_gif.py` | 录制脚本，自动生成 GIF + MP4 |
| `battery-animation.gif` | 渲染产物（1280×720 / 25fps / 32s 无缝循环，~18 MB） |
| `battery-animation.mp4` | 渲染产物（H.264，~1.7 MB，**推荐 PPT 使用**） |

## 在线查看动画

直接双击 `index.html` 在浏览器中打开（建议 Chrome / Edge）。

## 在 PowerPoint 中嵌入

推荐用 `battery-animation.mp4`（文件最小、画质最高）：

1. PPT → 插入 → 视频 → 此设备 → 选 `battery-animation.mp4`
2. 选中视频 → "播放"选项卡 → **开始：自动**，勾选 **循环播放，直到停止**

或者用 `battery-animation.gif`：插入图片即可，幻灯片放映时自动循环。

## 重新生成 GIF / MP4

依赖：

- Python 3.9+
- [ffmpeg](https://ffmpeg.org/)（确保在 PATH 中，或用 `winget install Gyan.FFmpeg`）
- Playwright + Chromium：

  ```bash
  pip install playwright pillow
  python -m playwright install chromium
  ```

运行：

```bash
python make_gif.py
```

`make_gif.py` 会：

1. 临时给 `script.js` 打补丁（M2 周期对齐 32s + lerp 改为帧率无关，保证录制效果与 HTML 一致）
2. 启动 Chromium（带 `--disable-gpu-vsync` 等 flags 解除 RAF 限速）
3. 录制 40s webm，再用 ffmpeg `palettegen + paletteuse` 切出居中的 32s 高质量 GIF + MP4
4. **自动恢复 `script.js`** 原始内容
