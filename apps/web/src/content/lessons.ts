/**
 * First-party Learning Lab content. All text is original to this project (Apache-2.0).
 * Each reading section carries an author-written fallback question that is used when AI
 * question generation is unavailable, so engagement checks never depend on the network.
 */

export interface LessonQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface LessonSection {
  id: string;
  heading: string;
  paragraphs: string[];
  code?: string;
  question: LessonQuestion;
}

export interface ReadingLesson {
  slug: string;
  title: string;
  skillHint: string;
  sections: LessonSection[];
}

export const PYTHON_FUNCTIONS_LESSON: ReadingLesson = {
  slug: 'python-functions',
  title: 'Python Functions: Parameters, Return Values and Scope',
  skillHint: 'Python',
  sections: [
    {
      id: 'why-functions',
      heading: 'Why functions exist',
      paragraphs: [
        'A function is a named block of code that you can run whenever you need it. Instead of copying the same five lines into three places, you write them once inside a function and call that function three times. When the logic changes, you fix it in one place.',
        'Functions also give a piece of logic a name. A line such as total = add_tax(price) tells the reader what is happening without forcing them to read the arithmetic. Good names turn a program into something closer to a list of intentions.',
        'In Python you define a function with the def keyword, followed by the name, a pair of parentheses and a colon. The indented lines underneath form the body. Nothing in the body runs until the function is called.',
      ],
      code: 'def greet():\n    print("Hello from a function")\n\ngreet()  # prints: Hello from a function',
      question: {
        question: 'When does the code inside a function body run?',
        options: [
          'As soon as Python reads the def line',
          'Only when the function is called',
          'Only if the function returns a value',
          'When the program ends',
        ],
        correctIndex: 1,
        explanation:
          'Defining a function only stores it. The body runs each time the function is called.',
      },
    },
    {
      id: 'parameters',
      heading: 'Parameters and arguments',
      paragraphs: [
        'Parameters are the names listed inside the parentheses of a definition. Arguments are the actual values you pass when you call the function. In def area(width, height), width and height are parameters; in area(3, 4), the numbers 3 and 4 are arguments.',
        'Python matches positional arguments to parameters from left to right. You can also pass keyword arguments, such as area(height=4, width=3), which match by name and make calls easier to read when a function takes several values.',
        'A parameter can have a default value: def greet(name="friend"). If the caller leaves the argument out, the default is used. Defaults are evaluated once, when the function is defined, which is why a mutable default such as an empty list can surprise you. The safe pattern is to default to None and create the list inside the body.',
      ],
      code: 'def area(width, height=1):\n    return width * height\n\narea(3, 4)          # 12\narea(5)             # 5  (height defaults to 1)\narea(height=2, width=6)  # 12',
      question: {
        question: 'In def area(width, height=1), what happens when you call area(5)?',
        options: [
          'It raises an error because height is missing',
          'height uses its default value of 1',
          'width becomes 1 and height becomes 5',
          'Python asks the user for height',
        ],
        correctIndex: 1,
        explanation: 'height has a default value, so omitting it is allowed and 1 is used.',
      },
    },
    {
      id: 'return-values',
      heading: 'Return values',
      paragraphs: [
        'The return statement sends a value back to the caller and ends the function immediately. Any lines after a return that runs are skipped. A function can contain several return statements, for example one inside an if branch and another at the end.',
        'If a function finishes without reaching a return statement, it returns the special value None. This is a common source of bugs: printing a value inside a function is not the same as returning it. print shows text on the screen, while return hands a value to the code that called the function so it can be stored or used in an expression.',
        'Python functions can return several values at once by separating them with commas. Under the hood this builds a tuple, which the caller can unpack into separate variables.',
      ],
      code: 'def min_max(values):\n    return min(values), max(values)\n\nlow, high = min_max([4, 9, 1])  # low = 1, high = 9\n\ndef shout(text):\n    print(text.upper())\n\nresult = shout("hi")  # prints HI, but result is None',
      question: {
        question: 'What does a Python function return if it never reaches a return statement?',
        options: ['0', 'An empty string', 'None', 'The last value it printed'],
        correctIndex: 2,
        explanation: 'Without an explicit return, a Python function returns None.',
      },
    },
    {
      id: 'scope',
      heading: 'Variable scope',
      paragraphs: [
        'Scope decides where a name can be seen. A variable assigned inside a function is local to that function: it is created when the function runs and disappears when it returns. Code outside the function cannot see it.',
        'Python looks names up in a fixed order often summarised as LEGB: Local, Enclosing function, Global (module level), then Built-in. When you read a variable, Python searches these scopes in that order and uses the first match.',
        'Assigning to a name inside a function makes it local for the whole function, even if a global variable has the same name. That is why reading a global and then assigning to it in the same function raises UnboundLocalError. You can declare global counter to rebind a module-level name, but passing values in as parameters and returning results is usually clearer and easier to test.',
      ],
      code: 'count = 10\n\ndef bump():\n    count = 1      # a new local variable\n    return count\n\nbump()   # 1\ncount    # still 10',
      question: {
        question: 'After running the example, what is the value of the global count?',
        options: ['1', '10', '11', 'It raises UnboundLocalError'],
        correctIndex: 1,
        explanation:
          'The assignment inside bump creates a local variable; the global count stays 10.',
      },
    },
    {
      id: 'putting-it-together',
      heading: 'Putting it together',
      paragraphs: [
        'Small functions with clear parameters and return values are easy to reuse and easy to test. A useful habit is to keep input and output at the edges of a program and keep the functions in the middle pure: they take arguments, compute a result and return it without printing or changing global state.',
        'When you write a function, ask three questions. What does it need? Those are the parameters. What does it produce? That is the return value. What should it leave untouched? That is the scope it should not reach outside of.',
        'Try it yourself: write a function average(values) that returns the mean of a list, and returns None for an empty list instead of crashing. Then call it with a few lists and check the results.',
      ],
      code: 'def average(values):\n    if not values:\n        return None\n    return sum(values) / len(values)\n\naverage([2, 4, 6])  # 4.0\naverage([])         # None',
      question: {
        question: 'Which design keeps a function easiest to test?',
        options: [
          'Read input and print output inside it',
          'Change global variables it relies on',
          'Take arguments and return a result',
          'Avoid parameters and use globals',
        ],
        correctIndex: 2,
        explanation:
          'Pure functions that take arguments and return results are the simplest to test.',
      },
    },
  ],
};

export function lessonText(lesson: ReadingLesson): string {
  return lesson.sections
    .map((s) => [s.heading, ...s.paragraphs, s.code ?? ''].join('\n'))
    .join('\n\n');
}

export interface MediaLesson {
  slug: string;
  kind: 'video' | 'audio';
  title: string;
  src: string;
  captions: string;
  description: string;
  skillHint: string;
}

export const VIDEO_LESSON: MediaLesson = {
  slug: 'python-functions-video',
  kind: 'video',
  title: 'Python Functions in Practice (video lesson)',
  src: '/lab/media/python-functions.webm',
  captions: '/lab/media/python-functions.vtt',
  description:
    'A short narrated slide lesson on defining functions, parameters, return values and scope in Python.',
  skillHint: 'Python',
};

export const AUDIO_LESSON: MediaLesson = {
  slug: 'sql-select-audio',
  kind: 'audio',
  title: 'SQL SELECT Basics (audio lesson)',
  src: '/lab/media/sql-select.webm',
  captions: '/lab/media/sql-select.vtt',
  description: 'A narrated audio lesson on SELECT, WHERE, ORDER BY and LIMIT in SQL.',
  skillHint: 'SQL',
};
