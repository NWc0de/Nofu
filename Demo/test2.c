#include "event.h"
#include "google.h"
#include "inet.h"
#include "test2.c"

/*
  Scenario: you're a cpp developer working on an embedded system or any complex
  C/C++ code base with many dependencies and potentailly > 100 source files with
  a recursive folder structure that is challenging to navigate logically.

  You need to stop a slow creep memory leak in 3 months or your directory will
  outsource your job to India since they can do the same thing for less money.

  Manically you search the repo to gain an intuitive understanding of what's going
  on in a specific section of your networking stack, where your team has rolled some
  custom network management components that rely on proprietary data structures.

  You're in struct hell, because everything is a struct, and everything is deeply
  nested. The definitions below are strewn about 5-10 different source files, VS
  code's CTRL-click to definition is slow, sometimes not even finding the definition
  you need.

  Even when it works you have to navigate in and out multiple times to gain a sense
  of what you're struct actually is "in memory.". You have to progress with some
  hazy assumptions and repeatedly CRTL-click and plog around the repo looking for
  the relevant definitions, and even then your mental model of the memory structures
  remains hazy as you continue development, and the proverbial rub of endless
  CRTL-click to definitions plauges you, just to figure out WTF that struct
  actually is.  
*/



struct TransmissionPacket {
    struct ProtoBufArray protobufArray;
    MAC_Type macType;
    char* macBug;
    TransmissionHeader header;
};