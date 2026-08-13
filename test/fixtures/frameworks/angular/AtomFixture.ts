import {Component, ViewChild, signal, type ElementRef} from '@angular/core';

// Bundles several Angular-controlled DOM shapes that atoms are exercised against in
// test/unit/frameworks/angular.spec.ts, mirroring react/AtomFixture.tsx's cases plus two that are
// specific to Angular: `@if`/`@for` control-flow blocks, which create/destroy real DOM nodes
// (unlike React's style-toggling "conditional" case here, which keeps the same node).
@Component({
  standalone: true,
  selector: 'app-atom-fixture',
  template: `
    <input id="ng-text-input" [value]="name()" (input)="name.set(inputValue($event))" />
    <span id="ng-text-echo">{{ name() }}</span>

    <input id="ng-checkbox" type="checkbox" [checked]="agreed()" (change)="agreed.set(checkedValue($event))" />
    <span id="ng-checkbox-echo">{{ agreed() ? 'yes' : 'no' }}</span>

    <input id="ng-otp-0" [value]="otp0()" (input)="onOtp0Input(inputValue($event))" />
    <input id="ng-otp-1" #otp1Ref [value]="otp1()" (input)="otp1.set(inputValue($event))" />

    <select id="ng-select" [value]="fruit()" (change)="fruit.set(inputValue($event))">
      <option value="apple">Apple</option>
      <option value="banana">Banana</option>
      <option value="cherry">Cherry</option>
    </select>
    <span id="ng-select-echo">{{ fruit() }}</span>

    <input
      type="radio"
      id="ng-radio-red"
      name="ng-color"
      [checked]="color() === 'red'"
      (change)="color.set('red')"
    />
    <input
      type="radio"
      id="ng-radio-blue"
      name="ng-color"
      [checked]="color() === 'blue'"
      (change)="color.set('blue')"
    />
    <span id="ng-radio-echo">{{ color() }}</span>

    <button id="ng-toggle-btn" type="button" [disabled]="!agreed()">Continue</button>

    <input id="ng-prefilled-input" [value]="prefilled()" (input)="prefilled.set(inputValue($event))" />
    <span id="ng-prefilled-echo">{{ prefilled() }}</span>

    <span id="ng-conditional" [style.display]="fruit() !== 'apple' ? 'inline' : 'none'">Now visible</span>

    <span id="ng-styled" [style.color]="styledColor">Styled</span>

    <form id="ng-form" (submit)="onSubmit($event)">
      <input id="ng-form-input" type="text" value="x" />
      <span id="ng-form-echo">{{ submitted() ? 'submitted' : 'not-submitted' }}</span>
    </form>

    <button id="ng-if-toggle-btn" type="button" (click)="showPanel.set(!showPanel())">Toggle panel</button>
    @if (showPanel()) {
      <div id="ng-if-panel">
        <span id="ng-if-content">Panel content</span>
      </div>
    }

    <button id="ng-for-add-btn" type="button" (click)="addTag()">Add tag</button>
    <ul id="ng-for-list">
      @for (tag of tags(); track tag) {
        <li class="ng-for-item">{{ tag }}</li>
      }
    </ul>
  `,
})
export class AtomFixture {
  name = signal('');
  agreed = signal(false);
  otp0 = signal('');
  otp1 = signal('');
  fruit = signal<'apple' | 'banana' | 'cherry'>('apple');
  color = signal<'red' | 'blue'>('red');
  prefilled = signal('prefilled');
  styledColor = 'rgb(255, 0, 0)';
  submitted = signal(false);
  showPanel = signal(false);
  tags = signal(['tag-0', 'tag-1']);

  // Signal-based `viewChild()` needs Angular's ngtsc compiler transform to resolve, which this
  // project's plain esbuild+JIT bundling of fixtures doesn't run; the classic decorator form below
  // resolves fine under JIT, since `@Component`'s JIT compile step reads decorator metadata
  // directly off the class.
  @ViewChild('otp1Ref') private otp1Ref?: ElementRef<HTMLInputElement>;

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  checkedValue(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  onOtp0Input(value: string): void {
    this.otp0.set(value);
    if (value.length >= 1) {
      this.otp1Ref?.nativeElement.focus();
    }
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
  }

  addTag(): void {
    this.tags.update((tags) => [...tags, `tag-${tags.length}`]);
  }
}
