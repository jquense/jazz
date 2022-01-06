# reduce calc

Turn complex CSS `calc` and other math expressions into their simplest form.

```js
import reduceCalc from '@jazzcss/reduce-calc';

reduceCalc('calc((1px * (10 + 10)) / 2)'); // -> '10px'

reduceCalc('max(40px, 20px, 300px)'); // -> '300px'

reduceCalc('calc(max(5cm, 30mm + 3cm, 1mm) + 60mm)'); // -> '12cm'

reduceCalc('calc((10 + 10) * 1px + 100vh)'); // -> 'calc(20px + 100vh)'
```
