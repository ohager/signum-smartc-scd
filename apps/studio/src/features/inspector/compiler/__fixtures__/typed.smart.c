#program name Typed
#pragma version 2.3.0

struct SALE { long price; long owner; } sale;
long counter;
fixed rate;
long prices[3];
long *ptr;
const long K = 5;

void main(void) {
    counter++;
    rate = 1.5;
    prices[1] = K;
    sale.price = 2;
    helper(counter);
}

void helper(long a) {
    long local;
    local = a;
}
