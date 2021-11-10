import reduceCalc from '../index';

describe('reduceCalc', () => {
  it.each([
    ['calc((1px * (10 + 10)) / 2)', '10px'],
    ['calc(1px * 10)', '10px'],
    ['calc(1 * 10px)', '10px'],
    ['calc(max(5cm, 30mm + 3cm, 1mm) + 60mm)', '12cm'],
    ['calc(calc(1 + /* 4 + */ 4) * 10px)', '50px'],
    ['calc(calc(1 + 4px) * 10)', '50px'],
    ['min(40px, 20px)', '20px'],
    ['min(40px, 20px, 35px)', '20px'],
    ['max(40px, 20px)', '40px'],
    ['max(40px, 20px, 300px)', '300px'],
    ['clamp(40px, 30px, 60px)', '40px'],
    ['clamp(40px, 70px, 60px)', '60px'],
  ])('%s -> %s', (input, expected) => {
    expect(reduceCalc(input)).toEqual(expected);
  });

  it.each([
    ['calc((10 + 10) * 1px + 100vh)', 'calc(20px + 100vh)'],
    ['calc(-10px + 100vh)', 'calc(-10px + 100vh)'],
    ['calc(var(--foo) + 100vh)', 'calc(var(--foo) + 100vh)'],
    ['calc((10px + 10px) + 100vh)', 'calc(20px + 100vh)'],
    ['calc(calc(1em + 10px) + 100vh)', 'calc(1em + 10px + 100vh)'],
    ['calc(-(calc(1px + 10px)) + 100vh)', 'calc(-11px + 100vh)'],
    ['calc(-(calc(1em + 10px)) + 100vh)', 'calc(-1 * (1em + 10px) + 100vh)'],
    [
      'calc(max(10px, 3% + 30px, 4vw) * 1)',
      'calc(max(10px, 3% + 30px, 4vw) * 1)',
    ],

    [
      'min(var(--a), 20px + 2em, max(20px + 30px, 10px))',
      'min(var(--a), 20px + 2em, 50px)',
    ],

    [
      'max(var(--a), 20px + 2em, max(20px + 30px, 10px))',
      'max(var(--a), 20px + 2em, 50px)',
    ],

    [
      'clamp(var(--a), 20px + 2em, max(20px + 30px, 10px))',
      'clamp(var(--a), 20px + 2em, 50px)',
    ],
  ])('%s -> %s', (input, expected) => {
    expect(reduceCalc(input)).toEqual(expected);
  });
});
