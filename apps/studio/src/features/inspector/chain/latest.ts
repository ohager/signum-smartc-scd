/**
 * Tags each response with whether it still answers the newest request. A
 * slow answer to an older question must not overwrite a newer one on screen.
 */
export function createLatest() {
  let newest = 0;
  return <T,>(request: Promise<T>): Promise<{ current: boolean; value: T }> => {
    const mine = ++newest;
    return request.then((value) => ({ current: mine === newest, value }));
  };
}
