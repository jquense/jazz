import React from 'react';

import '../styles/tailwind.css';
import styles from '../styles/test.jazz';

console.log(styles);
export default () => <h1 className={styles.app}>This is a 3xl text</h1>;
