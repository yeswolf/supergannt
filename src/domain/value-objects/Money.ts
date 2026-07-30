export class Money {
  private constructor(
    readonly amount: number,
    readonly currency: string,
  ) {
    if (!Number.isFinite(amount)) {
      throw new Error('Money amount must be finite')
    }
    if (!currency.trim()) {
      throw new Error('Currency is required')
    }
  }

  static of(amount: number, currency = 'USD'): Money {
    return new Money(amount, currency)
  }

  static zero(currency = 'USD'): Money {
    return new Money(0, currency)
  }

  add(other: Money): Money {
    this.assertSameCurrency(other)
    return Money.of(this.amount + other.amount, this.currency)
  }

  multiply(factor: number): Money {
    return Money.of(this.amount * factor, this.currency)
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency
  }

  format(): string {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: this.currency,
    }).format(this.amount)
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`)
    }
  }
}
