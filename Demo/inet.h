/*
blah blah blah
...
*/

enum MAC_Type {SHA256, MD5, SHA1, ECC};
enum TransmissionClass {TCP, UDP, P2P};
enum OriginId {HOST, NET};

struct TransmissionHeader {
    char* buf;
    int len;
    OriginId oId;
};
