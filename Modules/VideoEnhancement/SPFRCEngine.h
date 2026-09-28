// Apple frame-rate conversion session pool. Slots own a processor and reusable
// RGBA16F buffers. Metal converts input/output formats. In-flight requests
// finish after invalidation but discard their results. The planner uses
// measured end-to-end latency to check presentation deadlines.
#import <CoreVideo/CoreVideo.h>
#import <Foundation/Foundation.h>
#import "SPFrameBudgetMetal.h"

NS_ASSUME_NONNULL_BEGIN

/// Success transfers a +1 midpoint reference to the caller. Failure returns
/// NULL with an error. The callback may run on any thread; do not block.
typedef void (^SPFRCEngineCompletion)(uint64_t token, CVPixelBufferRef _Nullable midpoint,
                                      double latencySec, NSError *_Nullable error);

@interface SPFRCEngine : NSObject

/// Requires macOS 15.4 or later and local frame-rate conversion support.
@property (class, nonatomic, readonly, getter=isAvailable) BOOL available;
/// Returns 0/1 if resolved, or -1 without resolving or blocking.
+ (int)availabilityIfResolved;
/// Resolves capability on a utility queue; no work if already resolved.
+ (void)resolveAvailabilityAsync;

/// sessions is in [1,8]. Exceeding outputCapacity fails that pair.
- (nullable instancetype)initWithMetal:(SPFrameBudgetMetal *)metal
                              sessions:(unsigned)sessions
                        outputCapacity:(NSUInteger)outputCapacity
                                 error:(NSError **)error NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

@property (nonatomic, readonly) SPFrameBudgetMetal *metal;
@property (nonatomic, readonly) unsigned sessionCount;
@property (nonatomic, readonly) unsigned busyCount;
/// End-to-end latency in seconds; initially an estimate.
@property (nonatomic, readonly) double latencyEstimateSec;
/// EWMA seconds in frame conversion and the three GPU format conversions.
@property (nonatomic, readonly) double frcCoreEstimateSec;
@property (nonatomic, readonly) double conversionGPUEstimateSec;
@property (nonatomic, readonly) uint64_t completedPairs;
@property (nonatomic, readonly) uint64_t failedPairs;
/// Throughput since resetThroughputWindow, used for session calibration.
- (void)resetThroughputWindow;
- (double)throughputWindowPairsPerSecond;
- (uint64_t)throughputWindowPairs;

/// Adds sessions immediately and retires excess sessions when idle.
/// Failure returns NO and preserves the previous count.
- (BOOL)setSessionCount:(unsigned)sessions error:(NSError **)error;
/// Thread-safe release of idle output buffers after memory pressure or ring shrink.
- (void)flushIdleOutputBuffers;

/// Keep A/B alive until completion. NO means no free slot or invalidation.
- (BOOL)submitPairWithFrameA:(CVPixelBufferRef)frameA
                      frameB:(CVPixelBufferRef)frameB
                       token:(uint64_t)token
                  completion:(SPFRCEngineCompletion)completion;

/// Remaining in-flight seconds per slot (idle is zero); count is at most 8.
- (void)copySlotBusyRemaining:(double *)out count:(unsigned)count;

/// Ends all sessions. In-flight requests complete with an error.
- (void)invalidate;

@end

NS_ASSUME_NONNULL_END
