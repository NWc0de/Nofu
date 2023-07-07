/*
blah blah blah
...
*/


enum EventType {ONE, TWO, THREE};
struct EventChain {
    struct EventChain* n;
    char* buf;
    int len;
    EventType type;
};