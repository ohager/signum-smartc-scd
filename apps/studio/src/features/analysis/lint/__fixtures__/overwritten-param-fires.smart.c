#pragma version 2.3
#pragma optimizationLevel 2

long owner;
#ifdef TESTBED
const owner = TESTBED_owner;
#endif

long count;

constructor();

void constructor() {
    owner = getCreator();
}

void main(void) {
    count++;
}
