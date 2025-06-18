import { Calculator, calc } from '../utils/calculator';

describe('Calculator', () => {
  let calculator: Calculator;

  beforeEach(() => {
    calculator = new Calculator();
  });

  describe('Basic Operations', () => {
    test('should add two numbers correctly', () => {
      expect(calculator.add(2, 3)).toBe(5);
      expect(calculator.add(-1, 1)).toBe(0);
    });

    test('should subtract two numbers correctly', () => {
      expect(calculator.subtract(5, 3)).toBe(2);
      expect(calculator.subtract(1, 1)).toBe(0);
    });

    test('should multiply two numbers correctly', () => {
      expect(calculator.multiply(4, 5)).toBe(20);
      expect(calculator.multiply(-2, 3)).toBe(-6);
    });

    test('should divide two numbers correctly', () => {
      expect(calculator.divide(10, 2)).toBe(5);
      expect(calculator.divide(7, 2)).toBe(3.5);
    });

    test('should throw error when dividing by zero', () => {
      expect(() => calculator.divide(5, 0)).toThrow(
        'Division by zero is not allowed'
      );
    });
  });

  describe('Advanced Operations', () => {
    test('should calculate percentage correctly', () => {
      expect(calculator.percentage(100, 20)).toBe(20);
      expect(calculator.percentage(150, 10)).toBe(15);
    });

    test('should calculate power correctly', () => {
      expect(calculator.power(2, 3)).toBe(8);
      expect(calculator.power(5, 2)).toBe(25);
    });

    test('should calculate square root correctly', () => {
      expect(calculator.sqrt(16)).toBe(4);
      expect(calculator.sqrt(25)).toBe(5);
    });

    test('should throw error for negative square root', () => {
      expect(() => calculator.sqrt(-1)).toThrow(
        'Cannot calculate square root of negative number'
      );
    });
  });

  describe('Static Methods', () => {
    test('should work with static methods', () => {
      expect(calc.add(1, 2)).toBe(3);
      expect(calc.multiply(3, 4)).toBe(12);
    });
  });
});
