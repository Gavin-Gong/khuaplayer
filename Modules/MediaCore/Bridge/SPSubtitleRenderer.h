#import <Foundation/Foundation.h>
#import <Metal/Metal.h>

@interface SPSubtitleRenderer : NSObject

- (instancetype)initWithDevice:(id<MTLDevice>)device logId:(unsigned)logId;

@property (nonatomic) unsigned spLogId;

- (void)processChunk:(const uint8_t *)data length:(size_t)len ptsUs:(int64_t)ptsUs durationUs:(int64_t)durationUs;

- (void)setCodecPrivate:(NSData *)priv;

- (void)loadSubtitleText:(NSString *)text completion:(void (^)(BOOL ok))completion;

// Load a primary/secondary pair into one libass track. The primary script is
// rendered with a bottom style and the secondary script with a top style.
// Passing nil for either side keeps the other side usable.
- (void)loadSubtitleText:(NSString *)primaryText
           secondaryText:(nullable NSString *)secondaryText
              completion:(void (^)(BOOL ok))completion;

- (void)invalidatePendingLoads;

- (id<MTLTexture>)textureForTime:(int64_t)us viewportWidth:(int)vw viewportHeight:(int)vh;

- (void)forceNextSample;

- (void)resetTrack;

- (void)setFontScale:(double)scale;

@property (nonatomic, readonly) BOOL hasSubtitles;

@property (nonatomic, readonly) CGPoint textureOrigin;

@property (atomic, copy) void (^publishCallback)(void);

@end

FOUNDATION_EXPORT NSString *SPSubtitleInlineTagsToASS(NSString *line);
