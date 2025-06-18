/**
 * Simple Calculator with basic math operations
 */
export class Calculator {
  /**
   * Add two numbers
   */
  add(a: number, b: number): number {
    return a + b;
  }

  /**
   * Subtract two numbers
   */
  subtract(a: number, b: number): number {
    return a - b;
  }

  /**
   * Multiply two numbers
   */
  multiply(a: number, b: number): number {
    return a * b;
  }

  /**
   * Divide two numbers
   */
  divide(a: number, b: number): number {
    if (b === 0) {
      throw new Error('Division by zero is not allowed');
    }
    return a / b;
  }

  /**
   * Calculate percentage
   */
  percentage(value: number, percentage: number): number {
    return (value * percentage) / 100;
  }

  /**
   * Calculate power
   */
  power(base: number, exponent: number): number {
    return Math.pow(base, exponent);
  }

  /**
   * Calculate square root
   */
  sqrt(value: number): number {
    if (value < 0) {
      throw new Error('Cannot calculate square root of negative number');
    }
    return Math.sqrt(value);
  }
}

// Static methods for direct usage
export const calc = {
  add: (a: number, b: number) => a + b,
  subtract: (a: number, b: number) => a - b,
  multiply: (a: number, b: number) => a * b,
  divide: (a: number, b: number) => {
    if (b === 0) throw new Error('Division by zero is not allowed');
    return a / b;
  },
  percentage: (value: number, percentage: number) => (value * percentage) / 100,
  power: (base: number, exponent: number) => Math.pow(base, exponent),
  sqrt: (value: number) => {
    if (value < 0) throw new Error('Cannot calculate square root of negative number');
    return Math.sqrt(value);
  }
};
