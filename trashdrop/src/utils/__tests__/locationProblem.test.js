import { describeLocationProblem } from '../locationProblem.js';

describe('describeLocationProblem', () => {
  it('says the site is blocked when the browser permission is denied', () => {
    expect(describeLocationProblem({ code: 1 }, 'denied').kind).toBe('blocked');
  });

  it("says the phone's location is off when the site is allowed but no position comes back", () => {
    expect(describeLocationProblem({ code: 1 }, 'granted').kind).toBe('device-off');
    expect(describeLocationProblem({ code: 2 }, 'granted').kind).toBe('device-off');
    expect(describeLocationProblem({ code: 1 }, 'unknown').kind).toBe('device-off');
  });

  it('treats a timeout as a weak signal', () => {
    expect(describeLocationProblem({ code: 3 }, 'granted').kind).toBe('weak-signal');
  });

  it('never claims an approximate location was used', () => {
    [[{ code: 1 }, 'denied'], [{ code: 2 }, 'granted'], [{ code: 3 }, 'granted'], [null, 'unknown']]
      .forEach(([err, perm]) => {
        const p = describeLocationProblem(err, perm);
        expect(`${p.title} ${p.steps.join(' ')}`).not.toMatch(/approximate/i);
      });
  });
});
