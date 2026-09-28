#ifndef KhuaPlayer_Bridging_Header_h
#define KhuaPlayer_Bridging_Header_h

#import "SPPlayerCore.h"
#import "SPCaptionAudioReader.h"
#import "SPCaptionSubtitleReader.h"

#ifdef __cplusplus
extern "C"
#endif
void SPPrewarmMetalDevice(void);

#ifdef __cplusplus
extern "C"
#endif
void SPPrewarmVideoDecoders(void);

#endif
