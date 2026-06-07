"""一键将 SVG 动画转为 1280x720 / 25fps / 32s 无缝循环 GIF + MP4。

V2 改进：
  - 让浏览器自然按 60fps 跑动画（lerp / CSS 动画行为与 HTML 一致）。
  - 用 Playwright 的 record_video 直接由 chromium 内部录制 webm，不再手动驱动 elapsed。
  - 录制 40 秒，再用 ffmpeg 切出居中的 32 秒（M1/M2 都是 32s 周期 → 自然无缝循环）。
  - 同时输出 MP4（H.264 CRF 18，画质最高）和 GIF（palette 优化）。

唯一会临时修改 script.js 的地方：把 M2 的 chargingDuration 从 4*6.5 改为 4*7，
让 M2 周期与 M1 完全对齐为 32 秒。脚本结束时会自动恢复。
"""

from __future__ import annotations

import asyncio
import shutil
import subprocess
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

WORKDIR = Path(__file__).parent.resolve()
HTML_FILE = WORKDIR / "index.html"
SCRIPT_FILE = WORKDIR / "script.js"
SCRIPT_BACKUP = WORKDIR / "script.backup.js"
RECORD_DIR = WORKDIR / "_recording"
GIF_FILE = WORKDIR / "battery-animation.gif"
MP4_FILE = WORKDIR / "battery-animation.mp4"

RECORD_SECONDS = 40       # 录制总时长（必须 > 周期 + 安全边距）
CLIP_START = 5.0          # 切片起点（避开录制头几秒可能的暖机）
CLIP_DURATION = 32.0      # 切片时长 = M1/M2 共同周期
FPS = 25
WIDTH, HEIGHT = 1280, 720


def patch_script() -> None:
    """临时修改 script.js：
    1) M2 chargingDuration 4*6.5 → 4*7，让 M2 周期对齐为 32s；
    2) M1/M2 的 personPos lerp 改为基于墙钟时间的衰减，使运动节奏与帧率解耦
       —— 即使 chromium 录制时 RAF 跑得慢，运动行为也跟原 60fps 完全一致。
    """
    if SCRIPT_BACKUP.exists():
        SCRIPT_BACKUP.unlink()
    shutil.copy(SCRIPT_FILE, SCRIPT_BACKUP)
    content = SCRIPT_BACKUP.read_text(encoding="utf-8")

    replacements = [
        # M2 周期对齐 32s
        (
            "const chargingDuration = 4 * 6.5;",
            "const chargingDuration = 4 * 7;",
        ),
        # M1.personPos lerp 帧率无关：60fps × 0.12 等价衰减常数 k = -ln(0.88)/(1/60) ≈ 7.668
        (
            "  M1.personPos.x += (M1.personTarget.x - M1.personPos.x) * 0.12;\n"
            "  M1.personPos.y += (M1.personTarget.y - M1.personPos.y) * 0.12;",
            "  {\n"
            "    const _now = performance.now();\n"
            "    const _dt = Math.min(0.1, (_now - (M1._lastFrame || _now)) / 1000);\n"
            "    M1._lastFrame = _now;\n"
            "    const _f = 1 - Math.exp(-_dt * 7.668);\n"
            "    M1.personPos.x += (M1.personTarget.x - M1.personPos.x) * _f;\n"
            "    M1.personPos.y += (M1.personTarget.y - M1.personPos.y) * _f;\n"
            "  }",
        ),
        # M2.personPos lerp 帧率无关：60fps × 0.1 等价衰减常数 k = -ln(0.9)/(1/60) ≈ 6.318
        (
            "  M2.personPos.x += (M2.personTarget.x - M2.personPos.x) * 0.1;\n"
            "  M2.personPos.y += (M2.personTarget.y - M2.personPos.y) * 0.1;",
            "  {\n"
            "    const _now = performance.now();\n"
            "    const _dt = Math.min(0.1, (_now - (M2._lastFrame || _now)) / 1000);\n"
            "    M2._lastFrame = _now;\n"
            "    const _f = 1 - Math.exp(-_dt * 6.318);\n"
            "    M2.personPos.x += (M2.personTarget.x - M2.personPos.x) * _f;\n"
            "    M2.personPos.y += (M2.personTarget.y - M2.personPos.y) * _f;\n"
            "  }",
        ),
    ]

    for old, new in replacements:
        if old not in content:
            raise RuntimeError(f"补丁失败：未找到片段 '{old[:60]}...'")
        content = content.replace(old, new, 1)

    SCRIPT_FILE.write_text(content, encoding="utf-8")
    print("[1/3] script.js 临时补丁已打（周期对齐 + lerp 帧率无关）", flush=True)


def restore_script() -> None:
    if SCRIPT_BACKUP.exists():
        shutil.copy(SCRIPT_BACKUP, SCRIPT_FILE)
        SCRIPT_BACKUP.unlink()
        print("[done] script.js 已恢复原始内容", flush=True)


async def record_animation() -> Path:
    """让 chromium 自然跑动画，浏览器内部按 60fps 渲染，record_video 以 25fps 自动录制 webm。"""
    if RECORD_DIR.exists():
        for f in RECORD_DIR.glob("*"):
            f.unlink()
    else:
        RECORD_DIR.mkdir()

    print(f"[2/3] Chromium 启动并录制 webm（{RECORD_SECONDS} 秒）...", flush=True)
    t0 = time.time()
    async with async_playwright() as p:
        # 关键 flags：解除 RAF 限速 + 防止 renderer 进入后台节流
        chromium_args = [
            "--disable-gpu-vsync",
            "--disable-frame-rate-limit",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
            "--disable-features=CalculateNativeWinOcclusion",
        ]
        browser = await p.chromium.launch(headless=True, args=chromium_args)
        print("  - chromium 已启动（RAF 不限速）", flush=True)
        context = await browser.new_context(
            viewport={"width": WIDTH, "height": HEIGHT},
            device_scale_factor=1,
            record_video_dir=str(RECORD_DIR),
            record_video_size={"width": WIDTH, "height": HEIGHT},
        )
        page = await context.new_page()
        print(f"  - 加载页面：{HTML_FILE.as_uri()}", flush=True)
        await page.goto(HTML_FILE.as_uri(), wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_selector("#mainSvg", timeout=10000)
        await page.wait_for_timeout(500)

        # 探测 chromium 实际 RAF 频率（连续 1 秒数 raf 次数）
        raf_fps = await page.evaluate("""async () => {
            let frames = 0;
            const start = performance.now();
            await new Promise(resolve => {
                function tick() {
                    frames++;
                    if (performance.now() - start < 1000) requestAnimationFrame(tick);
                    else resolve();
                }
                requestAnimationFrame(tick);
            });
            return frames;
        }""")
        print(f"  - chromium RAF 实测频率: ~{raf_fps} fps", flush=True)
        print("  - 录制中...", flush=True)

        for sec in range(RECORD_SECONDS):
            await page.wait_for_timeout(1000)
            if (sec + 1) % 5 == 0 or sec + 1 == RECORD_SECONDS:
                print(f"    {sec + 1}/{RECORD_SECONDS}s", flush=True)

        await context.close()  # 关闭 context 才会落盘 webm
        await browser.close()

    webms = list(RECORD_DIR.glob("*.webm"))
    if not webms:
        raise RuntimeError(f"录制文件未找到，目录: {RECORD_DIR}")
    webm = webms[0]
    elapsed = time.time() - t0
    size_mb = webm.stat().st_size / 1024 / 1024
    print(f"  - 录制完成: {webm.name} ({size_mb:.2f} MB, 用时 {elapsed:.1f}s)", flush=True)
    return webm


def make_outputs(webm_path: Path) -> None:
    print("[3/3] ffmpeg 切片生成 MP4 + GIF...", flush=True)

    # MP4: H.264 CRF 18 高画质，PPT 友好
    print("  - 合成 MP4 (H.264, CRF 18)...", flush=True)
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-ss", str(CLIP_START),
            "-t", str(CLIP_DURATION),
            "-i", str(webm_path),
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-an",
            str(MP4_FILE),
        ],
        check=True,
    )

    # GIF: palettegen + paletteuse (single ffmpeg pass)
    print("  - 合成 GIF (palettegen+paletteuse)...", flush=True)
    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-ss", str(CLIP_START),
            "-t", str(CLIP_DURATION),
            "-i", str(webm_path),
            "-filter_complex",
            f"fps={FPS},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a",
            "-loop", "0",
            str(GIF_FILE),
        ],
        check=True,
    )

    # 清理 webm 临时文件
    webm_path.unlink(missing_ok=True)
    try:
        RECORD_DIR.rmdir()
    except OSError:
        pass

    gif_size = GIF_FILE.stat().st_size / 1024 / 1024
    mp4_size = MP4_FILE.stat().st_size / 1024 / 1024
    print(f"[done] 输出：", flush=True)
    print(f"  GIF  -> {GIF_FILE.name}  ({gif_size:.2f} MB)", flush=True)
    print(f"  MP4  -> {MP4_FILE.name}  ({mp4_size:.2f} MB)", flush=True)


async def main() -> None:
    try:
        patch_script()
        webm = await record_animation()
        make_outputs(webm)
    finally:
        restore_script()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n用户中断，正在恢复 script.js ...")
        restore_script()
        sys.exit(130)
