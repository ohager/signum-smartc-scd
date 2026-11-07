#pragma version 2.3
#pragma optimizationLevel 2

long owner;
#ifdef TESTBED
const owner = TESTBED_owner;
#endif

long count;

void main(void) {
    if (owner == 0) {
        owner = getCreator();
    }
    count++;
}
