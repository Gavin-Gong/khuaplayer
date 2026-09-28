#include "SPFFmpegDecoder.h"
#include "SPAv1CatchUpSkip.hpp"
#include "SPSoftwareDecodePolicy.hpp"
#include "SPVideoColorMetadata.hpp"
#import "SPPlanarPixelFormat.h"

#import <IOSurface/IOSurface.h>
#include <dav1d/dav1d.h>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavutil/opt.h>
#include <libavutil/pixdesc.h>
#include <libavutil/imgutils.h>
#include <libswscale/swscale.h>
}

#include <atomic>
#include <deque>
#include <mutex>
#include <vector>

struct SPPendingSoftwareFrame {
    CVPixelBufferRef buffer = NULL;
    int64_t ptsUs = AV_NOPTS_VALUE;
    SPDecodedVideoScanVerdict scanVerdict = SPDecodedVideoScanVerdictUnknown;
    BOOL scanCovered = NO;
};

#include "SPRuntimeGates.hpp"

static std::mutex gSPAv1CtxClaimMtx;
static std::atomic<int64_t> gSPAv1CtxClaimedBytes{0};

static int64_t spAv1CtxWallBytes(void) {
    static const int64_t v = spswdec::av1BudgetWallBytes(
        (int64_t)[[NSProcessInfo processInfo] physicalMemory]);
    return v;
}

static spswdec::Av1DelayPlan spAv1CtxClaim(spswdec::Av1DelayInput in,
                                           int64_t *claimSlot) {
    std::lock_guard<std::mutex> lock(gSPAv1CtxClaimMtx);
    if (*claimSlot > 0) gSPAv1CtxClaimedBytes.fetch_sub(*claimSlot);
    *claimSlot = 0;
    in.wallBytes = spAv1CtxWallBytes();
    in.claimedBytes = gSPAv1CtxClaimedBytes.load();
    const spswdec::Av1DelayPlan plan = spswdec::av1FrameDelayPlan(in);
    if (plan.claimBytes > 0) {
        *claimSlot = plan.claimBytes;
        gSPAv1CtxClaimedBytes.fetch_add(plan.claimBytes);
    }
    return plan;
}

static void spAv1CtxRelease(int64_t *claimSlot) {
    std::lock_guard<std::mutex> lock(gSPAv1CtxClaimMtx);
    if (*claimSlot > 0) gSPAv1CtxClaimedBytes.fetch_sub(*claimSlot);
    *claimSlot = 0;
}

static bool spParIsProbably10Bit(const AVCodecParameters *par) {
    int depth = 0;
    const AVPixFmtDescriptor *pd = av_pix_fmt_desc_get((AVPixelFormat)par->format);
    if (pd && pd->nb_components > 0) depth = pd->comp[0].depth;
    if (depth <= 0 && par->bits_per_raw_sample > 0) depth = (int)par->bits_per_raw_sample;
    return depth <= 0 ? true : depth > 8;
}

struct SPDav1dAllocBase {
    bool scratch = false;
};

struct SPDav1dSurface : SPDav1dAllocBase {
    IOSurfaceRef surface = NULL;
    CVPixelBufferRef pixelBuffer = NULL;
    OSType format = 0;
    bool held = false;
    bool locked = false;
    bool stale = false;
    int64_t idleSinceUs = 0;
};

struct SPDav1dScratch : SPDav1dAllocBase {
    void *mem = nullptr;
    size_t size = 0;
};

struct SPDav1dSurfacePool {
    std::mutex mtx;
    std::vector<SPDav1dSurface *> entries;
    std::vector<SPDav1dScratch *> scratchFree;
    int width = 0, height = 0;
    OSType format = 0;
    bool fullRange = false;
    size_t created = 0, reused = 0, peakEntries = 0;
    size_t scratchCreated = 0, scratchReused = 0;
    static constexpr size_t kScratchKeep = 3;

    static constexpr size_t kSpare = 2;
    static constexpr int64_t kIdleTrimUs = 2000000;

    ~SPDav1dSurfacePool() {
        for (SPDav1dSurface *e : entries) freeEntry(e);
        entries.clear();
        for (SPDav1dScratch *x : scratchFree) freeScratch(x);
        scratchFree.clear();
    }

    static void freeScratch(SPDav1dScratch *x) {
        free(x->mem);
        delete x;
    }

    SPDav1dScratch *acquireScratch(size_t size) {
        std::lock_guard<std::mutex> lock(mtx);
        for (size_t i = 0; i < scratchFree.size(); i++) {
            if (scratchFree[i]->size == size) {
                SPDav1dScratch *x = scratchFree[i];
                scratchFree.erase(scratchFree.begin() + (long)i);
                scratchReused++;
                return x;
            }
        }
        void *mem = nullptr;
        if (posix_memalign(&mem, DAV1D_PICTURE_ALIGNMENT, size) != 0 || !mem) return nullptr;
        auto *x = new SPDav1dScratch;
        x->scratch = true;
        x->mem = mem;
        x->size = size;
        scratchCreated++;
        return x;
    }

    void releaseScratch(SPDav1dScratch *x) {
        std::lock_guard<std::mutex> lock(mtx);

        for (size_t i = 0; i < scratchFree.size();) {
            if (scratchFree[i]->size != x->size) {
                freeScratch(scratchFree[i]);
                scratchFree.erase(scratchFree.begin() + (long)i);
                continue;
            }
            i++;
        }
        if (scratchFree.size() < kScratchKeep) scratchFree.push_back(x);
        else freeScratch(x);
    }

    static void freeEntry(SPDav1dSurface *e) {
        if (e->locked) { IOSurfaceUnlock(e->surface, 0, NULL); e->locked = false; }
        if (e->pixelBuffer) CVPixelBufferRelease(e->pixelBuffer);
        if (e->surface) CFRelease(e->surface);
        delete e;
    }

    static bool reusableLocked(const SPDav1dSurface *e) {
        return !e->held && !e->stale && e->pixelBuffer && e->surface &&
               CFGetRetainCount(e->pixelBuffer) == 1 &&
               IOSurfaceGetUseCount(e->surface) <= 1;
    }

    static IOSurfaceRef createSurface(int w, int h, bool tenBit, OSType fmt) {
        const int bps = tenBit ? 2 : 1;
        const int aw = (w + 127) & ~127, ah = (h + 127) & ~127;
        const size_t yStride = (size_t)aw * bps;
        const size_t cStride = (size_t)(aw / 2) * bps;
        const size_t ySize = yStride * (size_t)ah + DAV1D_PICTURE_ALIGNMENT;
        const size_t cSize = cStride * (size_t)(ah / 2) + DAV1D_PICTURE_ALIGNMENT;
        auto pageAlign = [](size_t v) { return (v + 4095) & ~(size_t)4095; };
        const size_t off1 = pageAlign(ySize), off2 = off1 + pageAlign(cSize);
        const size_t total = off2 + pageAlign(cSize);
        const int cw = (w + 1) / 2, chh = (h + 1) / 2;
        NSArray *planes = @[
            @{(__bridge NSString *)kIOSurfacePlaneWidth : @(w),
              (__bridge NSString *)kIOSurfacePlaneHeight : @(h),
              (__bridge NSString *)kIOSurfacePlaneBytesPerRow : @(yStride),
              (__bridge NSString *)kIOSurfacePlaneOffset : @0,
              (__bridge NSString *)kIOSurfacePlaneSize : @(pageAlign(ySize)),
              (__bridge NSString *)kIOSurfacePlaneBytesPerElement : @(bps)},
            @{(__bridge NSString *)kIOSurfacePlaneWidth : @(cw),
              (__bridge NSString *)kIOSurfacePlaneHeight : @(chh),
              (__bridge NSString *)kIOSurfacePlaneBytesPerRow : @(cStride),
              (__bridge NSString *)kIOSurfacePlaneOffset : @(off1),
              (__bridge NSString *)kIOSurfacePlaneSize : @(pageAlign(cSize)),
              (__bridge NSString *)kIOSurfacePlaneBytesPerElement : @(bps)},
            @{(__bridge NSString *)kIOSurfacePlaneWidth : @(cw),
              (__bridge NSString *)kIOSurfacePlaneHeight : @(chh),
              (__bridge NSString *)kIOSurfacePlaneBytesPerRow : @(cStride),
              (__bridge NSString *)kIOSurfacePlaneOffset : @(off2),
              (__bridge NSString *)kIOSurfacePlaneSize : @(pageAlign(cSize)),
              (__bridge NSString *)kIOSurfacePlaneBytesPerElement : @(bps)},
        ];
        NSDictionary *props = @{
            (__bridge NSString *)kIOSurfaceWidth : @(w),
            (__bridge NSString *)kIOSurfaceHeight : @(h),
            (__bridge NSString *)kIOSurfacePixelFormat : @(fmt),
            (__bridge NSString *)kIOSurfaceAllocSize : @(total),
            (__bridge NSString *)kIOSurfacePlaneInfo : planes,
        };
        return IOSurfaceCreate((__bridge CFDictionaryRef)props);
    }

    SPDav1dSurface *acquire(int w, int h, bool ten) {
        std::lock_guard<std::mutex> lock(mtx);
        const OSType fmt = spPlanarPixelFormat(ten, fullRange);
        if (w != width || h != height || fmt != format) {

            for (size_t i = 0; i < entries.size();) {
                SPDav1dSurface *x = entries[i];
                if (x->held) { x->stale = true; i++; continue; }
                freeEntry(x);
                entries.erase(entries.begin() + (long)i);
            }
            width = w; height = h; format = fmt;
        }
        for (SPDav1dSurface *e : entries) {
            if (reusableLocked(e)) {
                e->held = true;
                e->idleSinceUs = 0;
                IOSurfaceLock(e->surface, 0, NULL);
                e->locked = true;
                reused++;
                return e;
            }
        }
        IOSurfaceRef surf = createSurface(w, h, ten, fmt);
        if (!surf) return nullptr;
        CVPixelBufferRef pb = NULL;
        if (CVPixelBufferCreateWithIOSurface(kCFAllocatorDefault, surf, NULL, &pb) != kCVReturnSuccess || !pb) {
            CFRelease(surf);
            return nullptr;
        }
        auto *e = new SPDav1dSurface;
        e->surface = surf;
        e->pixelBuffer = pb;
        e->format = fmt;
        e->held = true;
        IOSurfaceLock(surf, 0, NULL);
        e->locked = true;
        entries.push_back(e);
        created++;
        if (entries.size() > peakEntries) peakEntries = entries.size();
        return e;
    }

    void release(SPDav1dSurface *e) {
        std::lock_guard<std::mutex> lock(mtx);
        if (e->locked) { IOSurfaceUnlock(e->surface, 0, NULL); e->locked = false; }
        e->held = false;
        const int64_t now = spNowUs();
        size_t spare = 0;
        for (size_t i = 0; i < entries.size();) {
            SPDav1dSurface *x = entries[i];
            bool drop = false;
            if (x->stale) {
                drop = !x->held;
            } else if (reusableLocked(x)) {
                if (x->idleSinceUs == 0) x->idleSinceUs = now;
                drop = ++spare > kSpare && now - x->idleSinceUs > kIdleTrimUs;
            } else {
                x->idleSinceUs = 0;
            }
            if (drop) {
                freeEntry(x);
                entries.erase(entries.begin() + (long)i);
                continue;
            }
            i++;
        }
    }

    size_t liveCount() { std::lock_guard<std::mutex> lock(mtx); return entries.size(); }

    NSString *describe() {
        std::lock_guard<std::mutex> lock(mtx);
        size_t held = 0, cfHeld = 0, useHeld = 0, free_ = 0, stale = 0;
        for (SPDav1dSurface *e : entries) {
            if (e->stale) stale++;
            if (e->held) { held++; continue; }
            const bool cf = CFGetRetainCount(e->pixelBuffer) > 1;
            const bool use = IOSurfaceGetUseCount(e->surface) > 1;
            if (cf) cfHeld++;
            else if (use) useHeld++;
            else free_++;
        }
        return [NSString stringWithFormat:@"条目 %zu：dav1d 持有 %zu · 消费者引用 %zu · 纹理占用 %zu · 空闲 %zu · 换代遗留 %zu",
                entries.size(), held, cfHeld, useHeld, free_, stale];
    }
};

static int spDav1dAllocPicture(Dav1dPicture *p, void *cookie) {
    auto *pool = static_cast<SPDav1dSurfacePool *>(cookie);
    if (!pool || p->p.layout != DAV1D_PIXEL_LAYOUT_I420 ||
        (p->p.bpc != 8 && p->p.bpc != 10)) {
        return DAV1D_ERR(ENOMEM);
    }

    const Dav1dFrameHeader *fh = p->frame_hdr;
    if (fh && fh->width[0] != fh->width[1] && p->p.w == fh->width[0]) {
        const int hbd = p->p.bpc > 8;
        const int aw = (p->p.w + 127) & ~127, ah = (p->p.h + 127) & ~127;
        ptrdiff_t yStride = (ptrdiff_t)aw << hbd;
        ptrdiff_t uvStride = yStride >> 1;
        if (!(yStride & 1023)) yStride += DAV1D_PICTURE_ALIGNMENT;
        if (!(uvStride & 1023)) uvStride += DAV1D_PICTURE_ALIGNMENT;
        const size_t ySize = (size_t)yStride * (size_t)ah;
        const size_t uvSize = (size_t)uvStride * (size_t)(ah >> 1);
        SPDav1dScratch *x = pool->acquireScratch(ySize + 2 * uvSize + 2 * DAV1D_PICTURE_ALIGNMENT);
        if (!x) return DAV1D_ERR(ENOMEM);
        uint8_t *base = static_cast<uint8_t *>(x->mem);
        p->data[0] = base;
        p->data[1] = base + ySize;
        p->data[2] = base + ySize + uvSize;
        p->stride[0] = yStride;
        p->stride[1] = uvStride;
        p->allocator_data = static_cast<SPDav1dAllocBase *>(x);
        return 0;
    }
    SPDav1dSurface *e = pool->acquire(p->p.w, p->p.h, p->p.bpc == 10);
    if (!e) return DAV1D_ERR(ENOMEM);
    p->data[0] = IOSurfaceGetBaseAddressOfPlane(e->surface, 0);
    p->data[1] = IOSurfaceGetBaseAddressOfPlane(e->surface, 1);
    p->data[2] = IOSurfaceGetBaseAddressOfPlane(e->surface, 2);
    p->stride[0] = (ptrdiff_t)IOSurfaceGetBytesPerRowOfPlane(e->surface, 0);
    p->stride[1] = (ptrdiff_t)IOSurfaceGetBytesPerRowOfPlane(e->surface, 1);
    p->allocator_data = static_cast<SPDav1dAllocBase *>(e);
    return 0;
}

static void spDav1dReleasePicture(Dav1dPicture *p, void *cookie) {
    auto *pool = static_cast<SPDav1dSurfacePool *>(cookie);
    auto *base = static_cast<SPDav1dAllocBase *>(p->allocator_data);
    if (!pool || !base) return;
    if (base->scratch) pool->releaseScratch(static_cast<SPDav1dScratch *>(base));
    else pool->release(static_cast<SPDav1dSurface *>(base));
}

static void spDav1dDataFree(const uint8_t *data, void *cookie) {
    (void)data;
    AVBufferRef *ref = static_cast<AVBufferRef *>(cookie);
    av_buffer_unref(&ref);
}

@implementation SPFFmpegDecoder {
    AVCodecContext *_ctx;
    AVFrame *_frame;
    struct SwsContext *_sws;
    CVPixelBufferPoolRef _pool;
    OSType _poolFormat;
    int _width, _height;
    bool _is10Bit;
    bool _fullRange;
    bool _rangeAuthoritative;

    int _streamColorPrimaries;
    int _streamColorTrc;
    int _streamColorSpace;
    AVPixelFormat _swsSrcFmt;
    int64_t _tbNum, _tbDen;
    std::deque<SPPendingSoftwareFrame> _pending;
    bool _eofFlushed;
    int _lastErr;
    std::atomic<int64_t> _catchUpTargetUs;
    bool _skipModeOn;
    int64_t _statDecodeUs;
    int64_t _statConvertUs;
    int _statFrames;
    int64_t _synthNextPtsUs;

    int64_t _av1ClaimBytes;

    spav1::SequenceHeader _av1Seq;
    bool _av1SkipArmed;
    bool _av1KeySelfChecked;
    AVPacket *_av1SubPkt;
    int64_t _av1DroppedFrames;

    Dav1dContext *_dav1d;
    SPDav1dSurfacePool *_dav1dPool;
    bool _dav1dSeqChecked;
    AVCodecParameters *_dav1dPar;
    int _dav1dMaxFrameDelay;
}

@synthesize spLogId = _spLogId;

- (instancetype)init {
    self = [super init];
    if (self) {
        _ctx = nullptr;
        _frame = nullptr;
        _sws = nullptr;
        _pool = NULL;
        _poolFormat = 0;
        _width = _height = 0;
        _is10Bit = false;
        _fullRange = false;
        _rgbSourceMatrix = AVCOL_SPC_BT709;
        _streamColorPrimaries = AVCOL_PRI_UNSPECIFIED;
        _streamColorTrc = AVCOL_TRC_UNSPECIFIED;
        _streamColorSpace = AVCOL_SPC_UNSPECIFIED;
        _swsSrcFmt = AV_PIX_FMT_NONE;
        _tbNum = 1; _tbDen = 1;
        _eofFlushed = false;
        _catchUpTargetUs.store(-1);
        _skipModeOn = false;
        _statDecodeUs = 0;
        _statConvertUs = 0;
        _statFrames = 0;
        _synthNextPtsUs = 0;
        _av1ClaimBytes = 0;
        _av1Seq = spav1::SequenceHeader();
        _av1SkipArmed = false;
        _av1KeySelfChecked = false;
        _av1SubPkt = nullptr;
        _av1DroppedFrames = 0;
        _dav1d = nullptr;
        _dav1dPool = nullptr;
        _dav1dSeqChecked = false;
        _dav1dPar = nullptr;
        _dav1dMaxFrameDelay = 0;
    }
    return self;
}

- (BOOL)planarOutputActive { return _dav1d != nullptr; }

- (void)dealloc {
    [self shutdown];
}

#define SPLOG(fmt, ...) NSLog(@"[c%u]" fmt, self->_spLogId, ##__VA_ARGS__)

- (int)setupWithCodecParameters:(const AVCodecParameters *)par
              timeBaseNumerator:(int64_t)tbNum
            timeBaseDenominator:(int64_t)tbDen {
    [self shutdown];

    _eofFlushed = false;
    _synthNextPtsUs = 0;
    _skipModeOn = false;
    _catchUpTargetUs.store(-1);
    _av1Seq = spav1::SequenceHeader();
    _av1SkipArmed = false;
    _av1KeySelfChecked = false;
    _av1DroppedFrames = 0;

    _tbNum = tbNum > 0 ? tbNum : 1;
    _tbDen = tbDen > 0 ? tbDen : 1;
    _width = par->width;
    _height = par->height;
    _streamColorPrimaries = par->color_primaries;
    _streamColorTrc = par->color_trc;
    _streamColorSpace = par->color_space;

    const AVCodec *codec = NULL;
    if (par->codec_id == AV_CODEC_ID_AV1) {
        codec = avcodec_find_decoder_by_name("libdav1d");
    }
    if (!codec) codec = avcodec_find_decoder((AVCodecID)par->codec_id);
    if (!codec) return -1;

    _ctx = avcodec_alloc_context3(codec);
    if (!_ctx) return -2;
    if (avcodec_parameters_to_context(_ctx, par) < 0) return -3;

    if (self.singleFrameMode) {
        _ctx->thread_count = 4;
        _ctx->thread_type = FF_THREAD_SLICE;
    } else {
        _ctx->thread_count = 0;
        _ctx->thread_type = FF_THREAD_FRAME | FF_THREAD_SLICE;
    }
#if !SP_APP_STORE

    if (getenv("SP_SW_THREADS")) {
        _ctx->thread_count = atoi(getenv("SP_SW_THREADS"));
    }
#endif

    BOOL lowDelay = YES;

    spswdec::Av1DelayPlan av1Plan;
    const bool isAv1 = par->codec_id == AV_CODEC_ID_AV1;
    if (isAv1) {
        spswdec::Av1DelayInput in;
        in.width = par->width;
        in.height = par->height;
        in.tenBit = spParIsProbably10Bit(par);
        in.singleFrameMode = self.singleFrameMode ? true : false;
        in.previewMode = self.previewMode ? true : false;
        av1Plan = spAv1CtxClaim(in, &_av1ClaimBytes);
        if (av1Plan.maxFrameDelay > 0) lowDelay = NO;
    }
#if SP_INTERNAL_BUILD && !SP_APP_STORE

    if (isAv1 && !self.singleFrameMode && getenv("SP_AV1_FRAME_DELAY")) {
        av1Plan.maxFrameDelay = atoi(getenv("SP_AV1_FRAME_DELAY"));
        lowDelay = NO;
    }
#endif
#if !SP_APP_STORE
    if (getenv("SP_SW_LOWDELAY")) lowDelay = atoi(getenv("SP_SW_LOWDELAY")) != 0;
#endif
    if (isAv1 && !lowDelay && av1Plan.maxFrameDelay > 0) {

        if (av_opt_set_int(_ctx->priv_data, "max_frame_delay",
                           av1Plan.maxFrameDelay, 0) < 0) {
            lowDelay = YES;
            av1Plan.maxFrameDelay = 0;
        }
    }

    if (!isAv1 || lowDelay || av1Plan.maxFrameDelay <= 0) {
        spAv1CtxRelease(&_av1ClaimBytes);
    }

    if (isAv1 && !self.singleFrameMode && spDebug()) {

        const int shownDelay = lowDelay ? 1
                             : (av1Plan.maxFrameDelay > 0 ? av1Plan.maxFrameDelay : -1);
        SPLOG(@"[SW] AV1 帧延迟=%d（-1=dav1d auto · 每上下文 %lldMB · 本槽认领 %lldMB · "
              @"进程已占 %lldMB / 墙 %lldMB · %dx%d %s）",
              shownDelay,
              av1Plan.perContextBytes / (1024 * 1024),
              _av1ClaimBytes / (1024 * 1024),
              gSPAv1CtxClaimedBytes.load() / (1024 * 1024),
              spAv1CtxWallBytes() / (1024 * 1024),
              par->width, par->height,
              spParIsProbably10Bit(par) ? "10bit" : "8bit");
    }

    if (isAv1 && !self.singleFrameMode) {
#if SP_APP_STORE
        static const bool noNrDrop = false;
#else
        static const bool noNrDrop = getenv("SP_NO_NRDROP") != nullptr;
#endif
        _av1SkipArmed = !noNrDrop;

        if (_av1SkipArmed && par->extradata && par->extradata_size > 4) {
            spav1::parseAv1CodecConfigRecord(par->extradata, (size_t)par->extradata_size,
                                             &_av1Seq);
        }
    }

    if (isAv1 && self.planarOutputEnabled &&
        !(self.outputWidthHint > 1 && self.outputHeightHint > 1)) {
        const int delay = lowDelay ? 1 : av1Plan.maxFrameDelay;

        const AVPixFmtDescriptor *pdesc = av_pix_fmt_desc_get((AVPixelFormat)par->format);
        _fullRange = (par->color_range == AVCOL_RANGE_JPEG) ||
                     (pdesc && strncmp(pdesc->name, "yuvj", 4) == 0);
        _rangeAuthoritative = (par->color_range != AVCOL_RANGE_UNSPECIFIED) ||
                              (pdesc && strncmp(pdesc->name, "yuvj", 4) == 0);
        if ([self setupDav1dWithParameters:par maxFrameDelay:delay] == 0) {
            avcodec_free_context(&_ctx);
            _is10Bit = spParIsProbably10Bit(par);
            if (spDebug()) {
                SPLOG(@"[SW] AV1 dav1d 直出启用：%dx%d 帧延迟=%d 线程=%d range=%s%s",
                      par->width, par->height, _dav1dMaxFrameDelay,
                      self.singleFrameMode ? 4 : 0,
                      _fullRange ? "full" : "limited",
                      _rangeAuthoritative ? "" : "(待序列头)");
            }
            return 0;
        }
        if (spDebug()) SPLOG(@"[SW] AV1 dav1d 直出不可用，回落 avcodec+swscale");
    }

    if (lowDelay && !self.singleFrameMode) {
        switch (par->codec_id) {
            case AV_CODEC_ID_MPEG1VIDEO:
            case AV_CODEC_ID_MPEG2VIDEO:
            case AV_CODEC_ID_MPEG4:
            case AV_CODEC_ID_VC1:
            case AV_CODEC_ID_WMV3:
            case AV_CODEC_ID_VC1IMAGE:
            case AV_CODEC_ID_WMV3IMAGE:
                lowDelay = NO;

                _ctx->thread_type = FF_THREAD_SLICE;
                break;
            default:
                break;
        }
    }
    if (lowDelay) _ctx->flags |= AV_CODEC_FLAG_LOW_DELAY;

    int ret = avcodec_open2(_ctx, codec, nullptr);
    if (ret < 0) return -4;

    _frame = av_frame_alloc();
    if (!_frame) return -5;

    AVPixelFormat srcFmt = _ctx->sw_pix_fmt != AV_PIX_FMT_NONE ? _ctx->sw_pix_fmt
                                                               : (AVPixelFormat)par->format;
    if (srcFmt == AV_PIX_FMT_NONE) {
        srcFmt = AV_PIX_FMT_YUV420P;
    }
    const AVPixFmtDescriptor *desc = av_pix_fmt_desc_get(srcFmt);

    _fullRange = (par->color_range == AVCOL_RANGE_JPEG) ||
                 (desc && strncmp(desc->name, "yuvj", 4) == 0);
    _rangeAuthoritative = (par->color_range != AVCOL_RANGE_UNSPECIFIED) ||
                          (desc && strncmp(desc->name, "yuvj", 4) == 0);
    if ([self rebuildPoolForWidth:_width height:_height format:srcFmt] != 0) return -6;
    return 0;
}

- (int)rebuildPoolForWidth:(int)w height:(int)h format:(AVPixelFormat)srcFmt {
    if (_sws) { sws_freeContext(_sws); _sws = nullptr; }
    if (_pool) { CVPixelBufferPoolRelease(_pool); _pool = NULL; }
    _width = w;
    _height = h;

    int ow = w, oh = h;
    if (self.outputWidthHint > 1 && self.outputHeightHint > 1) {
        ow = MAX(self.outputWidthHint & ~1, 2);
        oh = MAX(self.outputHeightHint & ~1, 2);
    }
    const BOOL resizing = (ow != w || oh != h);
    const AVPixFmtDescriptor *desc = av_pix_fmt_desc_get(srcFmt);
    _is10Bit = (desc && desc->comp[0].depth > 8);
    OSType cvFmt;
    if (_is10Bit) {
        cvFmt = _fullRange ? kCVPixelFormatType_420YpCbCr10BiPlanarFullRange
                           : kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange;
    } else {
        cvFmt = _fullRange ? kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
                           : kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange;
    }
    NSDictionary *poolAttrs = @{
        (__bridge NSString *)kCVPixelBufferPixelFormatTypeKey : @(cvFmt),
        (__bridge NSString *)kCVPixelBufferWidthKey : @(ow),
        (__bridge NSString *)kCVPixelBufferHeightKey : @(oh),
        (__bridge NSString *)kCVPixelBufferIOSurfacePropertiesKey : @{},
    };
    NSDictionary *poolOpts = @{
        (__bridge NSString *)kCVPixelBufferPoolMinimumBufferCountKey : @6,
    };
    CVPixelBufferPoolCreate(kCFAllocatorDefault, (__bridge CFDictionaryRef)poolOpts,
                            (__bridge CFDictionaryRef)poolAttrs, &_pool);
    if (!_pool) return -6;
    _poolFormat = cvFmt;
    AVPixelFormat dstFmt = _is10Bit ? AV_PIX_FMT_P010LE : AV_PIX_FMT_NV12;

    _sws = sws_getContext(w, h, srcFmt, ow, oh, dstFmt,
                          resizing ? SWS_AREA : SWS_BILINEAR,
                          nullptr, nullptr, nullptr);
    if (!_sws) return -7;

    {
        int srcR = _fullRange ? 1 : 0;
        const bool rgbSource = desc && (desc->flags & AV_PIX_FMT_FLAG_RGB);
        int cs = SWS_CS_DEFAULT;
        if (rgbSource) {
            switch (self.rgbSourceMatrix) {
                case AVCOL_SPC_BT470BG:
                case AVCOL_SPC_SMPTE170M:  cs = SWS_CS_ITU601; break;
                case AVCOL_SPC_SMPTE240M:  cs = SWS_CS_SMPTE240M; break;
                case AVCOL_SPC_BT2020_NCL:
                case AVCOL_SPC_BT2020_CL:  cs = SWS_CS_BT2020; break;
                default:                   cs = SWS_CS_ITU709; break;
            }
        }
        const int *coefs = sws_getCoefficients(cs);
        int *invTable = nullptr, *table = nullptr;
        int sR = 0, dR = 0, brightness = 0, contrast = 0, saturation = 0;
        if (!rgbSource && sws_getColorspaceDetails(_sws, &invTable, &sR, &table, &dR,
                                                   &brightness, &contrast, &saturation) >= 0) {
            sws_setColorspaceDetails(_sws, invTable, srcR, table, srcR,
                                     brightness, contrast, saturation);
        } else {
            sws_setColorspaceDetails(_sws, coefs, srcR, coefs, srcR, 0, 1 << 16, 1 << 16);
        }
    }
    _swsSrcFmt = srcFmt;
    return 0;
}

- (void)setCatchUpTargetUs:(int64_t)targetUs {

    const int64_t previous = _catchUpTargetUs.exchange(targetUs);
    if (previous <= 0 && targetUs > 0) {
        _av1DroppedFrames = 0;
    } else if (previous > 0 && targetUs <= 0 && _av1DroppedFrames > 0) {
        if (spDebug()) SPLOG(@"[SW] AV1 追赶丢弃非参考帧 %lld 帧（本次追赶）", _av1DroppedFrames);
        _av1DroppedFrames = 0;
    }
}

- (void)applySkipMode:(bool)on {
    if (!_ctx || _skipModeOn == on) return;
    _skipModeOn = on;
    _ctx->skip_frame = on ? AVDISCARD_NONREF : AVDISCARD_DEFAULT;
}

- (const AVPacket *)av1CatchUpPacketFor:(const AVPacket *)pkt {
    spav1::ScanResult scan =
        spav1::scanTemporalUnit(pkt->data, (size_t)pkt->size, &_av1Seq);

    if (!_av1KeySelfChecked && (pkt->flags & AV_PKT_FLAG_KEY)) {
        _av1KeySelfChecked = true;
        if (!scan.sawKeyFrame) {
            _av1SkipArmed = false;
            if (spDebug()) SPLOG(@"[SW] AV1 追赶尾截断停用：关键帧位对齐自检未通过");
            return pkt;
        }
    }

    if (scan.action == spav1::Action::DropPacket) {
        _av1DroppedFrames += scan.droppedFrames;
        return nullptr;
    }
    if (scan.action != spav1::Action::TruncateToPrefix) return pkt;

    if (!_av1SubPkt) {
        _av1SubPkt = av_packet_alloc();
        if (!_av1SubPkt) { _av1SkipArmed = false; return pkt; }
    }
    av_packet_unref(_av1SubPkt);

    if (av_packet_ref(_av1SubPkt, pkt) < 0) return pkt;
    _av1SubPkt->size = scan.keepBytes;
    _av1DroppedFrames += scan.droppedFrames;
    return _av1SubPkt;
}

- (SPDecodedVideoOutput)decodePacketOutput:(const AVPacket *)pkt {
    if (_dav1d) return [self dav1dDecodePacketOutput:pkt];
    if (!_ctx || !_frame) return SPDecodedVideoOutputEmpty();
    _lastErr = 0;
    int64_t cuTarget = _catchUpTargetUs.load();

    if (pkt == NULL) {
        if (_pending.empty()) {
            if (_eofFlushed) return SPDecodedVideoOutputEmpty();
            _eofFlushed = true;
            [self applySkipMode:false];
            int sendRet = avcodec_send_packet(_ctx, NULL);
            if (spDebug()) SPLOG(@"[SW] drain: send(NULL)=%d", sendRet);
            [self receiveAllWithCatchUp:cuTarget waitForDrain:true decodeStartUs:0];
        }
        return [self popPendingOutput];
    }

    const AVPacket *sendPkt = pkt;
    if (cuTarget > 0 && pkt->pts != AV_NOPTS_VALUE) {

        int64_t pktUs = av_rescale_q(pkt->pts, (AVRational){(int)_tbNum, (int)_tbDen}, AV_TIME_BASE_Q);
        const bool inSkipZone = (pktUs + 80000 < cuTarget);
        [self applySkipMode:inSkipZone];
        if (inSkipZone && _av1SkipArmed && pkt->data && pkt->size > 0) {
            sendPkt = [self av1CatchUpPacketFor:pkt];
            if (!sendPkt) return [self popPendingOutput];
        }
    } else {
        [self applySkipMode:false];
    }

    const bool profSend = spDebug();
    int64_t tSendStart = profSend ? spNowUs() : 0;
    int sendRet = avcodec_send_packet(_ctx, sendPkt);
    if (sendRet == AVERROR(EAGAIN)) {
        [self receiveAllWithCatchUp:cuTarget waitForDrain:false
                      decodeStartUs:tSendStart];
        tSendStart = profSend ? spNowUs() : 0;
        sendRet = avcodec_send_packet(_ctx, sendPkt);
    }
    if (sendRet < 0 && sendRet != AVERROR(EAGAIN) && sendRet != AVERROR_EOF) {
        _lastErr = sendRet;
        return [self popPendingOutput];
    }
    [self receiveAllWithCatchUp:cuTarget waitForDrain:false
                  decodeStartUs:tSendStart];
    return [self popPendingOutput];
}

- (void)receiveAllWithCatchUp:(int64_t)cuTarget
                 waitForDrain:(bool)waitForDrain
                decodeStartUs:(int64_t)decodeStartUs {
    const bool prof = spDebug();
    int64_t tDecodeStart = decodeStartUs > 0 ? decodeStartUs
                                             : (prof ? spNowUs() : 0);
    int eagainRetries = 0;
    while (true) {
        int ret = avcodec_receive_frame(_ctx, _frame);
        if (ret == 0) {
            eagainRetries = 0;
            int64_t ptsUs;
            if (_frame->best_effort_timestamp != AV_NOPTS_VALUE) {
                ptsUs = av_rescale_q(_frame->best_effort_timestamp,
                                     (AVRational){(int)_tbNum, (int)_tbDen},
                                     AV_TIME_BASE_Q);
            } else {

                ptsUs = _synthNextPtsUs;
            }
            {
                int64_t durUs = _frame->duration > 0
                    ? av_rescale_q(_frame->duration,
                                   (AVRational){(int)_tbNum, (int)_tbDen},
                                   AV_TIME_BASE_Q)
                    : 40000;
                _synthNextPtsUs = ptsUs + (durUs > 0 ? durUs : 40000);
            }

            if (cuTarget > 0 && ptsUs != AV_NOPTS_VALUE && ptsUs + 40000 < cuTarget) {
                av_frame_unref(_frame);
                continue;
            }
            int64_t tConvertStart = prof ? spNowUs() : 0;
            const bool interlaced = (_frame->flags & AV_FRAME_FLAG_INTERLACED) != 0;
            CVPixelBufferRef buf = [self frameToPixelBuffer:_frame];
            if (prof) {
                int64_t tNow = spNowUs();
                _statDecodeUs += tConvertStart - tDecodeStart;
                _statConvertUs += tNow - tConvertStart;
                _statFrames++;
                if (_statFrames % 60 == 0) {
                    SPLOG(@"[SW] 剖析: 解码 %.3fms/帧  转换(swscale) %.3fms/帧  共 %d 帧",
                          _statDecodeUs / 1000.0 / _statFrames,
                          _statConvertUs / 1000.0 / _statFrames,
                          _statFrames);
                }
                tDecodeStart = tNow;
            }
            av_frame_unref(_frame);
            if (!buf) continue;
            _pending.push_back({
                buf,
                ptsUs,
                interlaced ? SPDecodedVideoScanVerdictInterlaced
                           : SPDecodedVideoScanVerdictProgressive,
                YES,
            });

            if (!waitForDrain && (int)_pending.size() >= 8) break;
        } else if (ret == AVERROR(EAGAIN)) {
            if (waitForDrain && ++eagainRetries < 250) {
                usleep(2000);
                continue;
            }
            break;
        } else {

            if (ret != AVERROR_EOF) _lastErr = ret;
            break;
        }
    }
}

- (SPDecodedVideoOutput)popPendingOutput {
    if (_pending.empty()) {
        return SPDecodedVideoOutputEmpty();
    }
    SPPendingSoftwareFrame frame = _pending.front();
    _pending.pop_front();
    return SPDecodedVideoOutputMake(frame.buffer, frame.ptsUs,
                                    frame.scanVerdict, frame.scanCovered);
}

- (CVPixelBufferRef)frameToPixelBuffer:(AVFrame *)frame {

    if (!_rangeAuthoritative && frame->color_range != AVCOL_RANGE_UNSPECIFIED) {
        _rangeAuthoritative = true;
        const bool full = frame->color_range == AVCOL_RANGE_JPEG;
        if (full != _fullRange && frame->width > 0 && frame->height > 0) {
            _fullRange = full;
            if (spDebug()) SPLOG(@"[SW] 帧级 range=%s 补齐流级未声明 → 重建池",
                                 full ? "full" : "limited");
            if ([self rebuildPoolForWidth:frame->width height:frame->height
                                   format:(AVPixelFormat)frame->format] != 0) {
                _lastErr = AVERROR(EINVAL);
                return NULL;
            }
        }
    }

    if (frame->width > 0 && frame->height > 0 &&
        (frame->width != _width || frame->height != _height ||
         (AVPixelFormat)frame->format != _swsSrcFmt)) {
        if (spDebug()) SPLOG(@"[SW] 帧参数变化 %dx%d(fmt=%d) → %dx%d(fmt=%d)，重建池/缩放器",
                             _width, _height, _swsSrcFmt, frame->width, frame->height, frame->format);
        if ([self rebuildPoolForWidth:frame->width height:frame->height
                               format:(AVPixelFormat)frame->format] != 0) {
            _lastErr = AVERROR(EINVAL);
            return NULL;
        }
    }

    if (!_pool) { _lastErr = AVERROR(EINVAL); return NULL; }
    CVPixelBufferRef buf = NULL;
    CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, _pool, &buf);
    if (!buf) { _lastErr = AVERROR(ENOMEM); return NULL; }

    CVPixelBufferLockBaseAddress(buf, 0);
    uint8_t *dstY = (uint8_t *)CVPixelBufferGetBaseAddressOfPlane(buf, 0);
    size_t dstYStride = CVPixelBufferGetBytesPerRowOfPlane(buf, 0);
    uint8_t *dstUV = (uint8_t *)CVPixelBufferGetBaseAddressOfPlane(buf, 1);
    size_t dstUVStride = CVPixelBufferGetBytesPerRowOfPlane(buf, 1);

    uint8_t *dst[4] = { dstY, dstUV, NULL, NULL };
    int dstStride[4] = { (int)dstYStride, (int)dstUVStride, 0, 0 };
    if (_sws) {
        sws_scale(_sws, (const uint8_t *const *)frame->data, frame->linesize,
                  0, _height, dst, dstStride);

        const size_t cw = CVPixelBufferGetWidthOfPlane(buf, 1);
        if (_is10Bit && (CVPixelBufferGetWidth(buf) & 1) && cw >= 2) {
            const size_t ch = CVPixelBufferGetHeightOfPlane(buf, 1);
            for (size_t y = 0; y < ch; y++) {
                uint8_t *row = dstUV + y * dstUVStride;
                memcpy(row + (cw - 1) * 4, row + (cw - 2) * 4, 4);
            }
        }
    }
    CVPixelBufferUnlockBaseAddress(buf, 0);

    const sp::SPCVColorMetadata color = sp::spResolveCVColorMetadata(
        _streamColorPrimaries, _streamColorTrc, _streamColorSpace,
        frame->color_primaries, frame->color_trc, frame->colorspace);
    const auto setOrRemove = [buf](CFStringRef key, CFStringRef value) {
        if (value) {
            CVBufferSetAttachment(buf, key, value,
                                  kCVAttachmentMode_ShouldPropagate);
        } else {

            CVBufferRemoveAttachment(buf, key);
        }
    };
    setOrRemove(kCVImageBufferColorPrimariesKey, color.primaries);
    setOrRemove(kCVImageBufferTransferFunctionKey, color.transferFunction);
    setOrRemove(kCVImageBufferYCbCrMatrixKey, color.yCbCrMatrix);
    return buf;
}

- (void)flush {
    if (_ctx) avcodec_flush_buffers(_ctx);
    if (_dav1d) dav1d_flush(_dav1d);
    _eofFlushed = false;
    for (const SPPendingSoftwareFrame &frame : _pending) {
        if (frame.buffer) CVPixelBufferRelease(frame.buffer);
    }
    _pending.clear();

    _synthNextPtsUs = 0;
}

- (void)shutdown {

    spAv1CtxRelease(&_av1ClaimBytes);
    if (_av1SubPkt) av_packet_free(&_av1SubPkt);
    if (_dav1d) {
        dav1d_close(&_dav1d);
        _dav1d = nullptr;
        if (spDebug() && _dav1dPool) {
            SPLOG(@"[SW] dav1d 直出池：建 %zu 复用 %zu 峰值 %zu 存活 %zu · superres scratch 建 %zu 复用 %zu",
                  _dav1dPool->created, _dav1dPool->reused, _dav1dPool->peakEntries,
                  _dav1dPool->liveCount(), _dav1dPool->scratchCreated, _dav1dPool->scratchReused);
        }
    }

    for (const SPPendingSoftwareFrame &frame : _pending) {
        if (frame.buffer) CVPixelBufferRelease(frame.buffer);
    }
    _pending.clear();
    delete _dav1dPool;
    _dav1dPool = nullptr;
    if (_dav1dPar) avcodec_parameters_free(&_dav1dPar);
    _dav1dSeqChecked = false;
    if (_sws) { sws_freeContext(_sws); _sws = nullptr; }
    if (_frame) { av_frame_free(&_frame); }
    if (_ctx) { avcodec_free_context(&_ctx); }
    if (_pool) { CVPixelBufferPoolFlush(_pool, 0); CFRelease(_pool); _pool = NULL; }
}

- (BOOL)isHardwareDecoding { return NO; }
- (SPVideoDecodingBackend)decodingBackend {
    return SPVideoDecodingBackendFFmpegSoftware;
}
- (void)setInterpolationScanEnabled:(BOOL)enabled
                    codecParameters:(const AVCodecParameters *)par {
    // Software decode already exposes AVFrame's per-output field verdict in
    // SPDecodedVideoOutput. It needs no compressed-stream parser or sidecar
    // allocation, so strict Off remains allocation-free.
    (void)enabled;
    (void)par;
}

- (int)lastError { return _lastErr; }
- (NSString *)decoderName { return NSLocalizedString(@"renderer.decoder.ffmpegSW", nil); }

#pragma mark - Direct dav1d output

static int spDav1dSeqSupported(const uint8_t *buf, size_t size, Dav1dSequenceHeader *seqOut) {
    if (!buf || size == 0) return -1;
    Dav1dSequenceHeader seq;
    if (dav1d_parse_sequence_header(&seq, buf, size) < 0) return -1;
    if (seqOut) *seqOut = seq;
    return (seq.layout == DAV1D_PIXEL_LAYOUT_I420 && seq.hbd <= 1) ? 1 : 0;
}

- (int)setupDav1dWithParameters:(const AVCodecParameters *)par
                  maxFrameDelay:(int)delay {
    spRegisterPlanarPixelFormats();

    Dav1dSequenceHeader seq;
    int supported = -1;
    if (par->extradata && par->extradata_size > 4) {
        supported = spDav1dSeqSupported(par->extradata + 4, (size_t)par->extradata_size - 4, &seq);
    }
    if (supported == 0) return -1;
    _dav1dSeqChecked = supported == 1;
    if (_dav1dSeqChecked && !_rangeAuthoritative) {
        _rangeAuthoritative = true;
        _fullRange = seq.color_range != 0;
    }

    Dav1dSettings st;
    dav1d_default_settings(&st);

    st.n_threads = self.singleFrameMode ? 4 : 0;
#if !SP_APP_STORE
    if (getenv("SP_SW_THREADS")) st.n_threads = atoi(getenv("SP_SW_THREADS"));
#endif
    st.max_frame_delay = delay < 0 ? 0 : delay;
    st.apply_grain = 1;
    st.frame_size_limit = 0;
    st.all_layers = 0;
    st.operating_point = 0;
    st.strict_std_compliance = 0;
    auto *pool = new SPDav1dSurfacePool;
    st.allocator.cookie = pool;
    st.allocator.alloc_picture_callback = spDav1dAllocPicture;
    st.allocator.release_picture_callback = spDav1dReleasePicture;
    Dav1dContext *ctx = nullptr;
    if (dav1d_open(&ctx, &st) < 0 || !ctx) {
        delete pool;
        return -2;
    }
    _dav1d = ctx;
    _dav1dPool = pool;
    pool->fullRange = _fullRange;
    _dav1dMaxFrameDelay = st.max_frame_delay;
    if (!_dav1dSeqChecked) {
        _dav1dPar = avcodec_parameters_alloc();
        if (_dav1dPar) avcodec_parameters_copy(_dav1dPar, par);
    }
    return 0;
}

- (BOOL)dav1dCheckFirstPacket:(const AVPacket *)pkt {
    if (_dav1dSeqChecked || !pkt || !pkt->data || pkt->size <= 0) return YES;
    Dav1dSequenceHeader seq;
    const int supported = spDav1dSeqSupported(pkt->data, (size_t)pkt->size, &seq);
    if (supported < 0) return YES;
    _dav1dSeqChecked = true;
    if (supported == 1) {
        if (!_rangeAuthoritative) {
            _rangeAuthoritative = true;
            _fullRange = seq.color_range != 0;
            _dav1dPool->fullRange = _fullRange;
            if (spDebug()) SPLOG(@"[SW] 序列头 range=%s 补齐流级未声明", _fullRange ? "full" : "limited");
        }
        return YES;
    }
    if (spDebug()) SPLOG(@"[SW] 序列头布局 %d/hbd %d 不走直出，回落 avcodec+swscale", (int)seq.layout, seq.hbd);
    AVCodecParameters *par = _dav1dPar;
    _dav1dPar = nullptr;
    const BOOL savedPlanar = self.planarOutputEnabled;
    const int64_t savedCatchUp = _catchUpTargetUs.load();
    self.planarOutputEnabled = NO;
    const int r = par ? [self setupWithCodecParameters:par timeBaseNumerator:_tbNum
                                   timeBaseDenominator:_tbDen] : -1;
    self.planarOutputEnabled = savedPlanar;
    _catchUpTargetUs.store(savedCatchUp);
    if (par) avcodec_parameters_free(&par);
    return r == 0;
}

- (int)dav1dWrapPacket:(const AVPacket *)pkt into:(Dav1dData *)d {
    int r;
    if (pkt->buf) {
        AVBufferRef *ref = av_buffer_ref(pkt->buf);
        if (!ref) return DAV1D_ERR(ENOMEM);
        r = dav1d_data_wrap(d, pkt->data, (size_t)pkt->size, spDav1dDataFree, ref);
        if (r < 0) av_buffer_unref(&ref);
    } else {
        uint8_t *dst = dav1d_data_create(d, (size_t)pkt->size);
        if (!dst) return DAV1D_ERR(ENOMEM);
        memcpy(dst, pkt->data, (size_t)pkt->size);
        r = 0;
    }
    if (r == 0) {
        d->m.timestamp = pkt->pts;
        d->m.duration = pkt->duration;
    }
    return r;
}

- (SPDecodedVideoOutput)dav1dDecodePacketOutput:(const AVPacket *)pkt {
    _lastErr = 0;
    const int64_t cuTarget = _catchUpTargetUs.load();
    const bool prof = spDebug();

    if (pkt == NULL) {

        if (_pending.empty()) {
            if (_eofFlushed) return SPDecodedVideoOutputEmpty();
            _eofFlushed = true;
            [self dav1dReceiveWithCatchUp:cuTarget drain:true decodeStartUs:prof ? spNowUs() : 0];
        }
        return [self popPendingOutput];
    }
    if (![self dav1dCheckFirstPacket:pkt]) {
        _lastErr = AVERROR(EINVAL);
        return SPDecodedVideoOutputEmpty();
    }
    if (!_dav1d) return [self decodePacketOutput:pkt];

    const AVPacket *sendPkt = pkt;
    if (cuTarget > 0 && pkt->pts != AV_NOPTS_VALUE) {
        int64_t pktUs = av_rescale_q(pkt->pts, (AVRational){(int)_tbNum, (int)_tbDen}, AV_TIME_BASE_Q);
        const bool inSkipZone = (pktUs + 80000 < cuTarget);
        if (inSkipZone && _av1SkipArmed && pkt->data && pkt->size > 0) {
            sendPkt = [self av1CatchUpPacketFor:pkt];
            if (!sendPkt) return [self popPendingOutput];
        }
    }
    if (!sendPkt->data || sendPkt->size <= 0) return [self popPendingOutput];

    const int64_t tStart = prof ? spNowUs() : 0;
    Dav1dData d;
    memset(&d, 0, sizeof(d));
    int r = [self dav1dWrapPacket:sendPkt into:&d];
    if (r < 0) { _lastErr = r; return [self popPendingOutput]; }

    for (int guard = 0; guard < 64; guard++) {
        r = dav1d_send_data(_dav1d, &d);
        if (r != DAV1D_ERR(EAGAIN)) break;
        [self dav1dReceiveWithCatchUp:cuTarget drain:false decodeStartUs:tStart];
    }
    if (d.data) dav1d_data_unref(&d);
    if (r < 0 && r != DAV1D_ERR(EAGAIN)) {
        _lastErr = r;
        return [self popPendingOutput];
    }
    [self dav1dReceiveWithCatchUp:cuTarget drain:false decodeStartUs:tStart];
    return [self popPendingOutput];
}

- (void)dav1dReceiveWithCatchUp:(int64_t)cuTarget
                          drain:(bool)drain
                  decodeStartUs:(int64_t)decodeStartUs {
    const bool prof = spDebug();
    int64_t tDecodeStart = decodeStartUs > 0 ? decodeStartUs : (prof ? spNowUs() : 0);
    for (;;) {
        Dav1dPicture pic;
        memset(&pic, 0, sizeof(pic));
        const int r = dav1d_get_picture(_dav1d, &pic);
        if (r == DAV1D_ERR(EAGAIN)) break;
        if (r < 0) { _lastErr = r; break; }
        int64_t ptsUs;
        if (pic.m.timestamp != INT64_MIN && pic.m.timestamp != AV_NOPTS_VALUE) {
            ptsUs = av_rescale_q(pic.m.timestamp, (AVRational){(int)_tbNum, (int)_tbDen},
                                 AV_TIME_BASE_Q);
        } else {
            ptsUs = _synthNextPtsUs;
        }
        {
            int64_t durUs = pic.m.duration > 0
                ? av_rescale_q(pic.m.duration, (AVRational){(int)_tbNum, (int)_tbDen}, AV_TIME_BASE_Q)
                : 40000;
            _synthNextPtsUs = ptsUs + (durUs > 0 ? durUs : 40000);
        }
        if (cuTarget > 0 && ptsUs + 40000 < cuTarget) {
            dav1d_picture_unref(&pic);
            if (!drain) break;
            continue;
        }
        const int64_t tWrap = prof ? spNowUs() : 0;
        CVPixelBufferRef buf = [self dav1dWrapPicture:&pic];
        dav1d_picture_unref(&pic);
        if (prof) {
            const int64_t tNow = spNowUs();
            _statDecodeUs += tWrap - tDecodeStart;
            _statConvertUs += tNow - tWrap;
            _statFrames++;
            if (_statFrames % 60 == 0) {
                SPLOG(@"[SW] 剖析: 解码 %.3fms/帧  包装(零拷贝) %.3fms/帧  共 %d 帧  池建 %zu 复用 %zu  scratch建 %zu 复用 %zu  %@",
                      _statDecodeUs / 1000.0 / _statFrames,
                      _statConvertUs / 1000.0 / _statFrames, _statFrames,
                      _dav1dPool->created, _dav1dPool->reused,
                      _dav1dPool->scratchCreated, _dav1dPool->scratchReused,
                      _dav1dPool->describe());
            }
            tDecodeStart = tNow;
        }
        if (buf) {
            _pending.push_back({buf, ptsUs, SPDecodedVideoScanVerdictProgressive, YES});
        }
        if (!drain) break;
    }
}

- (CVPixelBufferRef)dav1dWrapPicture:(Dav1dPicture *)pic {
    auto *base = static_cast<SPDav1dAllocBase *>(pic->allocator_data);

    if (!base || base->scratch) { _lastErr = AVERROR(EINVAL); return NULL; }
    auto *e = static_cast<SPDav1dSurface *>(base);
    if (!e->pixelBuffer) { _lastErr = AVERROR(EINVAL); return NULL; }
    {
        std::lock_guard<std::mutex> lock(_dav1dPool->mtx);
        if (e->locked) { IOSurfaceUnlock(e->surface, 0, NULL); e->locked = false; }
    }
    CVPixelBufferRef buf = CVPixelBufferRetain(e->pixelBuffer);
    const Dav1dSequenceHeader *seq = pic->seq_hdr;

    const sp::SPCVColorMetadata color = sp::spResolveCVColorMetadata(
        _streamColorPrimaries, _streamColorTrc, _streamColorSpace,
        seq ? (int)seq->pri : AVCOL_PRI_UNSPECIFIED,
        seq ? (int)seq->trc : AVCOL_TRC_UNSPECIFIED,
        seq ? (int)seq->mtrx : AVCOL_SPC_UNSPECIFIED);
    const auto setOrRemove = [buf](CFStringRef key, CFStringRef value) {
        if (value) {
            CVBufferSetAttachment(buf, key, value, kCVAttachmentMode_ShouldPropagate);
        } else {
            CVBufferRemoveAttachment(buf, key);
        }
    };
    setOrRemove(kCVImageBufferColorPrimariesKey, color.primaries);
    setOrRemove(kCVImageBufferTransferFunctionKey, color.transferFunction);
    setOrRemove(kCVImageBufferYCbCrMatrixKey, color.yCbCrMatrix);
    return buf;
}

@end
