export const defaultLocale = "en";

// Headline conventions:
//   "\n" forces a line break on wide screens.
//   *word* marks the single accent word rendered in the editorial serif italic.

export const content = {
  en: {
    meta: {
      languageName: "English",
      documentTitle: "Khua Player — A media player built for speed",
      description:
        "Khua Player is a fast, open-source media player for Apple silicon Macs. It plays almost any file, even damaged or half-downloaded ones, with Motion+, Brightness+ and on-device subtitles.",
    },
    nav: {
      brand: "Khua Player",
      links: [
        { label: "Performance", target: "performance" },
        { label: "Resilience", target: "resilience" },
        { label: "Boosts", target: "boosts" },
        { label: "Formats", target: "formats" },
        { label: "Subtitles", target: "subtitles" },
        { label: "Quick Look", target: "quick-look" },
        { label: "Star Trail", target: "timeline" },
        { label: "Privacy", target: "privacy" },
        { label: "Open source", target: "open-source" },
      ],
      languageToggle: "简中",
      primaryAction: "Download",
    },
    hero: {
      eyebrow: "Local media player for macOS",
      title: "A media player\nbuilt for *{}*.",
      rotating: ["speed", "responsiveness", "fluidity", "efficiency", "performance"],
      description:
        "Double-click a file and it's playing. MKV, MP4, HDR, 4K, even files that are damaged or still downloading. A light, quiet app built for Apple silicon.",
      primaryAction: "Download for macOS",
      secondaryAction: "View source",
      compatibility: "Apple silicon · macOS 14 or later",
    },
    performance: {
      eyebrow: "Performance",
      title: "Built for the chip\ninside your *Mac.*",
      description:
        "Khua is written for Apple silicon and nothing else. Wherever the format allows, video decodes on the chip's dedicated media engine, and every frame goes straight to the screen with no detours. The result is a player that opens instantly, stays smooth through 4K and HDR, and leaves the rest of your Mac free for whatever else you're doing.",
      note: "Apple silicon only. Intel Macs are not supported.",
      facts: ["Hardware video decoding", "Direct-to-display Metal rendering", "HDR and 4K playback"],
      diagram: {
        heading: "How a frame reaches the screen",
        khua: {
          file: "Your file",
          layer: "Khua Player",
          bridge: "Metal · VideoToolbox",
          zeroCopy: "Zero copy",
          chip: "Apple silicon",
        },
        caption: "Wherever the format allows, the chip's media engine decodes the video and Metal puts it on screen. Decoded frames stay in memory the media engine and GPU share, so nothing is copied along the way.",
      },
    },
    boosts: {
      eyebrow: "Boosts",
      title: "Smoother, brighter,\nand *faster.*",
      description:
        "Three ways to get more from the same video. Motion+ makes movement smoother, Brightness+ makes the picture brighter, and Turbo gets you through the slow parts.",
      motion: {
        title: "Motion+",
        description:
          "Motion+ creates a new frame between every two, so pans and fast action flow instead of stutter. While it's on, hold C to see the original and Motion+ side by side.",
        note: "Requires macOS 26 and a supported Mac. Works on videos up to 4K at 1× speed; when the Mac is busy, only part of the video may be smoothed.",
        demo: {
          label: "Split comparison of a panning night street: the original at 24 frames per second on the left, Motion+ at 48 on the right.",
          before: "Original",
          after: "2× Interpolation",
          legendOriginal: "Original frames",
          legendGenerated: "Frames Motion+ creates",
        },
      },
      brightness: {
        title: "Brightness+",
        description:
          "Displays like the XDR screen on MacBook Pro can go brighter than the white you normally see. HDR video already uses that extra room; Brightness+ lets everyday SDR video use it too.",
        note: "Illustration. The real effect shows only on a display with extra brightness headroom.",
        demo: {
          label: "Split comparison of a night scene, dimmer with Brightness+ off and brighter with it on.",
          before: "Off",
          after: "Brightness+",
        },
      },
      turbo: {
        title: "Turbo",
        description:
          "Hold Space while a video plays and it runs at 2×; let go and it's back to normal. Voices keep their natural pitch, and you can set Turbo as high as 5×.",
        demo: {
          label: "A playing video that speeds up to 2× while the Space key is held.",
          key: "Space",
          keyLabel: "Hold to try Turbo",
          hint: "Press and hold",
        },
      },
    },
    resilience: {
      eyebrow: "Resilient playback",
      title: "Files break.\nKhua keeps *going.*",
      description:
        "A download that stopped halfway. A recording that's still being written. A file with a damaged stretch in the middle. Khua plays everything that can be played: it repairs what it can in memory, without ever changing your file, steps past what it can't, and marks those spots on the timeline. If a file is still downloading, playback starts as soon as it can and picks up the rest as it arrives.",
      note: "When a file truly can't be played, Khua tells you why.",
      demo: {
        label:
          "Khua's timeline, in the video's own colors, playing a file that is still downloading. Two damaged stretches are tinted amber and red, and the part not yet downloaded is gray.",
        fileName: "kyoto-by-night.mkv",
        download: { progress: "Downloading {p}%", done: "Download complete" },
        status: { playing: "Playing", waiting: "Waiting for download…" },
        legend: [
          { key: "partial", label: "Partial" },
          { key: "unavailable", label: "Unavailable" },
          { key: "pending", label: "Gray, sparse particles haven't downloaded yet" },
        ],
      },
    },
    subtitles: {
      eyebrow: "On-device subtitles",
      title: "No subtitles?\nNow there *are.*",
      description:
        "Khua can listen to a video and write its subtitles, right on your Mac. Choose your language and it translates them as it goes, with the translation shown above the original line. Already have subtitles in another language? It translates those too. Subtitles appear as they're generated, and the finished file is saved as an SRT next to the video.",
      note: "Requires macOS 26. Available languages depend on macOS, which may download a language model the first time.",
      demo: {
        label: "A video frame with an English translation shown above the original Japanese line.",
        status: "Transcribing {p}%, subtitles ready up to {t}",
        cues: [
          { translation: "Let's head out before sunrise.", original: "日が昇る前に出発しよう。" },
          { translation: "The road north should still be open.", original: "北の道なら、まだ通れるはずだ。" },
          { translation: "Then we'd better hurry.", original: "じゃあ、急がないと。" },
        ],
      },
    },
    formats: {
      eyebrow: "Formats",
      title: "Plays what you\nalready *have.*",
      description:
        "MKV, MP4, MOV, WebM, AVI, MPEG-TS, FLV, WMV, plus your music files. HDR and AV1 included, along with newer and professional formats like H.266 (VVC), ProRes, MXF and DNxHD. Subtitles inside the file, or a subtitle file sitting next to it, load on their own; Khua never downloads subtitles. No converting, no codec packs, no hunting for plugins.",
      tokens: ["MKV", "MP4", "MOV", "WebM", "AVI", "MPEG-TS", "FLV", "WMV", "MXF", "HEVC", "H.264", "VVC", "AV1", "ProRes", "DNxHD", "HDR", "4K", "SRT", "ASS", "FLAC", "MP3"],
    },
    timeline: {
      eyebrow: "Particle Star Trail",
      title: "A timeline painted\nby your *video.*",
      description:
        "Khua's default timeline is made of thousands of particles. Their colors are sampled from the video itself, and they gather more densely where the picture is busiest, so the whole video is sketched out at a glance. What you've watched settles into a bright line; what's ahead still drifts. Move your pointer over it and the particles nearby light up; on an XDR display they glow brighter than white.",
      note: "Liquid and Classic styles are one menu away.",
      label: "An interactive Particle Star Trail timeline. Its colors come from the video, and it glows under the pointer.",
      hint: "Hover or drag across the timeline",
      switchLabel: "Timeline style",
      styles: [
        { key: "starTrail", label: "Star Trail" },
        { key: "liquid", label: "Liquid" },
        { key: "classic", label: "Classic" },
      ],
    },
    quickLook: {
      eyebrow: "Quick Look",
      title: "Press Space.\nEven on an *MKV.*",
      description:
        "Select any video in Finder, tap Space, and it plays right there. MKV included, no app to open. Khua's Quick Look extension brings its own playback engine, so formats that usually never preview now simply do.",
      demo: {
        label: "Illustration: an MKV selected in a Finder window, the Space key, and the Quick Look panel playing it.",
        folder: "Movies",
        sidebarTitle: "Favorites",
        sidebar: ["Desktop", "Downloads", "Movies", "Documents"],
        files: ["kyoto-by-night.mkv", "summer-trip.mp4", "concert-2025.mkv", "lecture-07.webm", "first-snow.mov", "old-tapes.avi"],
        key: "Space",
        openWith: "Open with Khua",
      },
    },
    size: {
      eyebrow: "Light by design",
      title: "Quiet when closed.\nLight when *open.*",
      description:
        "When Khua isn't open, nothing of it is running: no helper apps, no menu bar agents, no background updater. When it is, decoding runs on the media engine rather than the CPU, and the app itself is small enough to download in seconds.",
      note: "About 20 MB today.",
    },
    privacy: {
      eyebrow: "Private by default",
      title: "Plays your files.\nNot your *data.*",
      description:
        "No account, no analytics, no ads. Your videos and your watch history stay on your Mac, and subtitles are generated and translated right there too. The privacy policy takes a minute to read, because there is so little to say.",
      action: "Read the privacy policy",
    },
    openSource: {
      eyebrow: "Open source",
      title: "Open source.\nSee for *yourself.*",
      description:
        "Khua's source is public under the MIT license. Read how it works, build it yourself, or help make it better.",
      action: "Read the source",
    },
    details: {
      eyebrow: "The small things",
      title: "Details you feel\nevery *day.*",
      items: [
        {
          title: "Picks up where you left off",
          description:
            "Reopen a video and it resumes at the exact moment you stopped. Continue watching is right on the welcome screen.",
        },
        {
          title: "Your subtitle files, loaded for you",
          description:
            "Keep a video and its subtitle file in the same folder and Khua loads it, picking the matching language when there are several. It never downloads subtitles.",
        },
        {
          title: "Frame by frame",
          description: "Press period or comma to step one frame forward or back and land on the exact moment.",
        },
        {
          title: "Screenshots with S",
          description: "Press S to save the current frame as an image, wherever you choose.",
        },
        {
          title: "Real surround sound",
          description:
            "5.1 and 7.1 soundtracks go out as true multichannel audio to speakers that support it, and Khua follows along when you switch outputs.",
        },
        {
          title: "Your default player, in one step",
          description:
            "A single dialog hands video, audio, or both to Khua. Undoing it is just as easy.",
        },
        {
          title: "Louder when you need it",
          description:
            "Boost quiet recordings up to 500%, with peak protection so nothing clips.",
        },
        {
          title: "More than one at a time",
          description: "Every video opens in its own window, so two files can play side by side.",
        },
        {
          title: "Speaks your language",
          description: "The interface is available in 17 languages.",
        },
      ],
    },
    closing: {
      eyebrow: "Ready when you are",
      title: "Get Khua Player.\nPress *play.*",
      description: "For Apple silicon Macs running macOS 14 or later.",
      primaryAction: "Download Khua Player",
      secondaryAction: "View on GitHub",
    },
    footer: {
      tagline: "A fast, private, open-source media player for macOS.",
      links: {
        source: "Source",
        license: "License",
        privacy: "Privacy",
      },
      compatibility: "Apple silicon · macOS 14 or later",
    },
  },
  zh: {
    meta: {
      languageName: "简体中文",
      documentTitle: "Khua Player — 为速度而生的多媒体播放器",
      description:
        "Khua Player 是一款快速的开源 Mac 播放器，专为 Apple 芯片打造。几乎什么格式都能播，连损坏了、没下完的文件也能播，还有 Motion+、Brightness+ 和本机字幕生成。",
    },
    nav: {
      brand: "Khua Player",
      links: [
        { label: "性能", target: "performance" },
        { label: "坏文件也能播", target: "resilience" },
        { label: "增强", target: "boosts" },
        { label: "格式", target: "formats" },
        { label: "字幕", target: "subtitles" },
        { label: "快速查看", target: "quick-look" },
        { label: "粒子星轨", target: "timeline" },
        { label: "隐私", target: "privacy" },
        { label: "开源", target: "open-source" },
      ],
      languageToggle: "EN",
      primaryAction: "下载",
    },
    hero: {
      eyebrow: "macOS 本地媒体播放器",
      title: "为*{}*而生的\n多媒体播放器。",
      rotating: ["速度", "迅捷", "流畅", "效率", "性能"],
      description:
        "双击就播。MKV、MP4、HDR、4K 都不在话下，没下完、有损坏的文件也能播。轻巧安静，专为 Apple 芯片打造。",
      primaryAction: "下载 macOS 版",
      secondaryAction: "查看源码",
      compatibility: "Apple 芯片 · macOS 14 及以上",
    },
    performance: {
      eyebrow: "性能",
      title: "为 Apple 芯片，\n量身*打造*。",
      description:
        "Khua 只支持 Apple 芯片，也因此能把芯片的本事用足：只要格式允许，视频直接交给芯片里的媒体引擎解码，画面经 Metal 直接送上屏幕，中间不绕路。打开就播，4K、HDR 照样流畅，你手头的其他工作也不受影响。",
      note: "仅支持 Apple 芯片，不支持 Intel Mac。",
      facts: ["硬件解码", "Metal 直接渲染", "4K 与 HDR"],
      diagram: {
        heading: "画面怎么走到屏幕上",
        khua: {
          file: "你的文件",
          layer: "Khua Player",
          bridge: "Metal · VideoToolbox",
          zeroCopy: "零拷贝",
          chip: "Apple 芯片",
        },
        caption: "只要格式支持，视频由芯片的媒体引擎解码，再经 Metal 送上屏幕。解码好的画面一直留在媒体引擎和 GPU 共享的内存里，全程不多复制一次。",
      },
    },
    boosts: {
      eyebrow: "增强功能",
      title: "更顺滑，更明亮，\n还能更*快*。",
      description:
        "同一段视频，还能看得更好：Motion+ 让动作更顺，Brightness+ 让画面更亮，想赶进度时，按住空格就是 Turbo 加速。",
      motion: {
        title: "Motion+",
        description:
          "Motion+ 在每两帧之间生成一帧新画面，镜头平移和快速动作不再一顿一顿。开启后，按住 C 键就能左右对比原片和增强后的效果。",
        note: "需要 macOS 26 和支持该功能的 Mac；适用于 4K 及以下的视频，仅在 1× 速度下工作。Mac 负载较高时，可能只有部分画面被增强。",
        demo: {
          label: "夜晚街道平移镜头的左右对比：左边是每秒 24 帧的原片，右边是 Motion+ 的每秒 48 帧。",
          before: "原始",
          after: "插帧 2×",
          legendOriginal: "原有的帧",
          legendGenerated: "Motion+ 新生成的帧",
        },
      },
      brightness: {
        title: "Brightness+",
        description:
          "MacBook Pro 等 XDR 屏幕，能亮过你平时看到的白色。HDR 视频本来就会用到这部分亮度，Brightness+ 让普通的 SDR 视频也用上它。",
        note: "示意图；真实效果只在有额外亮度余量的屏幕上才看得到。",
        demo: {
          label: "夜景画面的左右对比：关闭 Brightness+ 时偏暗，开启后更亮。",
          before: "关闭",
          after: "Brightness+",
        },
      },
      turbo: {
        title: "Turbo 加速",
        description:
          "播放时按住空格，视频就以 2 倍速播放；松手立刻回到正常速度。人声不会变调，倍速最高可以设到 5 倍。",
        demo: {
          label: "按住空格时，正在播放的视频加速到 2 倍。",
          key: "空格",
          keyLabel: "按住试试 Turbo 加速",
          hint: "按住试试",
        },
      },
    },
    resilience: {
      eyebrow: "坏文件也能播",
      title: "没下完、有损坏，\n照样*能播*。",
      description:
        "下载到一半断了、还在录制中、中间坏了一段，这样的文件，Khua 都会把能播的部分播出来。能修复的地方，它在内存里修好，原文件一个字节都不动；实在修不了的就跳过去，并在时间线上标出来。还在下载的文件也能边下边播，新内容到了自动接上。",
      note: "真的播不了，Khua 也会告诉你原因。",
      demo: {
        label: "Khua 的时间线保持影片自己的颜色，正在播放一个还没下载完的文件：两段损坏分别叠上琥珀色和红色，尚未下载的部分是灰色。",
        fileName: "kyoto-by-night.mkv",
        download: { progress: "下载中 {p}%", done: "已下载完成" },
        status: { playing: "播放中", waiting: "等待下载…" },
        legend: [
          { key: "partial", label: "勉强可播" },
          { key: "unavailable", label: "没有内容" },
          { key: "pending", label: "灰色稀疏的部分，是还没下载到的内容" },
        ],
      },
    },
    subtitles: {
      eyebrow: "字幕生成与翻译",
      title: "没有中文字幕？\n现在*有了*。",
      description:
        "没有字幕的视频，Khua 能听着对白，直接在你的 Mac 上生成字幕；选个语言，还能边生成边翻译，译文和原文上下对照。手上的外语字幕，也能直接翻成中文。字幕一边生成一边出现，不用干等；完成后存成 SRT 文件，放在视频旁边。",
      note: "需要 macOS 26。可用语言取决于系统；首次使用时，系统可能需要下载语言模型。",
      demo: {
        label: "视频画面中，中文译文显示在英文原文上方。",
        status: "转录中 {p}%，已生成到 {t}",
        cues: [
          { translation: "我们日出之前出发。", original: "Let's head out before sunrise." },
          { translation: "往北的路应该还通。", original: "The road north should still be open." },
          { translation: "那我们得抓紧了。", original: "Then we'd better hurry." },
        ],
      },
    },
    formats: {
      eyebrow: "格式",
      title: "你手里的文件，\n拿来就能*播*。",
      description:
        "MKV、MP4、MOV、WebM、AVI、MPEG-TS、FLV、WMV，还有各种音乐文件，都能直接播放。HDR、AV1 没问题，H.266（VVC）这样的新格式，ProRes、MXF、DNxHD 这类专业格式也支持。视频里内嵌的字幕，或者放在旁边的字幕文件，都会自动加载（Khua 不会上网下载字幕）。不用转码，不用装解码包，也不用到处找插件。",
      tokens: ["MKV", "MP4", "MOV", "WebM", "AVI", "MPEG-TS", "FLV", "WMV", "MXF", "HEVC", "H.264", "VVC", "AV1", "ProRes", "DNxHD", "HDR", "4K", "SRT", "ASS", "FLAC", "MP3"],
    },
    timeline: {
      eyebrow: "粒子星轨",
      title: "时间线的颜色，\n来自影片*本身*。",
      description:
        "Khua 默认的时间线由几千颗粒子组成，颜色取自影片画面；画面越丰富的段落，粒子越密，整部片子的样子一眼就能看出来。看过的部分沉淀成一条亮线，没看的部分还漂浮着。鼠标移上去，附近的粒子会亮起来；在 XDR 屏幕上，甚至比白色还亮。",
      note: "想要素净一点？菜单里可以换成液态或经典样式。",
      label: "可交互的粒子星轨时间线：颜色取自影片，指针经过时会发光。",
      hint: "在时间线上悬停或拖动试试",
      switchLabel: "时间线样式",
      styles: [
        { key: "starTrail", label: "粒子星轨" },
        { key: "liquid", label: "液态" },
        { key: "classic", label: "经典" },
      ],
    },
    quickLook: {
      eyebrow: "快速查看",
      title: "按下空格，\nMKV 直接*开播*。",
      description:
        "在访达里选中视频，按一下空格就能播放，连 MKV 也不例外，不用打开任何应用。Khua 的快速查看扩展自带播放引擎，那些以前按空格只能看到文件图标的格式，现在都能直接看。",
      demo: {
        label: "示意图：在访达中选中一个 MKV 文件，按下空格，快速查看窗口直接播放它。",
        folder: "影片",
        sidebarTitle: "个人收藏",
        sidebar: ["桌面", "下载", "影片", "文稿"],
        files: ["kyoto-by-night.mkv", "summer-trip.mp4", "concert-2025.mkv", "lecture-07.webm", "first-snow.mov", "old-tapes.avi"],
        key: "空格",
        openWith: "用“Khua”打开",
      },
    },
    size: {
      eyebrow: "轻量设计",
      title: "不用时不打扰，\n用起来也*轻快*。",
      description:
        "关掉 Khua，后台就不会留下任何属于它的东西：没有辅助程序，没有菜单栏图标，也没有后台更新程序。打开时，解码交给媒体引擎而不是 CPU；应用本身也很小，几秒钟就能下载完。",
      note: "目前约 20 MB。",
    },
    privacy: {
      eyebrow: "默认保护隐私",
      title: "只播放你的文件，\n不碰你的*数据*。",
      description:
        "不用注册账号，没有数据统计，也没有广告。你的视频和观看记录只留在自己的 Mac 上，连字幕的生成和翻译也在本机完成。隐私政策一分钟就能读完，因为确实没什么可写的。",
      action: "阅读隐私政策",
    },
    openSource: {
      eyebrow: "开放源代码",
      title: "源码公开，\n眼见为*实*。",
      description: "Khua 的源代码以 MIT 许可证公开。你可以看看它是怎么做的，自己编译一份，或者一起把它做得更好。",
      action: "阅读源码",
    },
    details: {
      eyebrow: "细微之处",
      title: "每天都会用到的\n那些*细节*。",
      items: [
        {
          title: "接着上次看",
          description: "重新打开视频，会从上次停下的地方接着放；欢迎页上就有“继续观看”。",
        },
        {
          title: "字幕文件自动加载",
          description: "字幕文件和视频放在同一个文件夹，Khua 会自动加载；有好几种语言时，优先挑和你匹配的那个。它不会上网下载字幕。",
        },
        {
          title: "一帧一帧地看",
          description: "按句号或逗号键，前进或后退一帧，精确停在想要的那一刻。",
        },
        {
          title: "按 S 截图",
          description: "按一下 S 键，把当前画面存成图片，存到你选的位置。",
        },
        {
          title: "真正的环绕声",
          description: "5.1、7.1 声道的音轨会原样输出到支持多声道的音箱；换了输出设备，Khua 也会自动跟过去。",
        },
        {
          title: "一步设为默认播放器",
          description: "一个对话框，就能把视频、音频文件交给 Khua 打开；想改回去也一样简单。",
        },
        {
          title: "音量能开到 500%",
          description: "录得太小声的视频，音量最高能开到 500%，有峰值保护，不会破音。",
        },
        {
          title: "多个视频同时看",
          description: "每个视频一个独立窗口，可以并排播放。",
        },
        {
          title: "支持 17 种语言",
          description: "界面已翻译成 17 种语言。",
        },
      ],
    },
    closing: {
      eyebrow: "随时开始",
      title: "下载 Khua Player，\n按下*播放*。",
      description: "适用于搭载 Apple 芯片、运行 macOS 14 或更高版本的 Mac。",
      primaryAction: "下载 Khua Player",
      secondaryAction: "前往 GitHub",
    },
    footer: {
      tagline: "一款快速、私密、开源的 macOS 播放器。",
      links: {
        source: "源代码",
        license: "许可证",
        privacy: "隐私",
      },
      compatibility: "Apple 芯片 · macOS 14 及以上",
    },
  },
};

export default content;
