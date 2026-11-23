/**
 * Objectively graded assessments (deterministic grading, no AI in the scoring path).
 * Results are labelled as unproctored self-attempts.
 */
import type { AssessmentType } from '@skilltrace/shared';

export interface AssessmentQuestion {
  id: string;
  type: AssessmentType;
  prompt: string;
  code?: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface AssessmentDefinition {
  id: string;
  skill: string;
  title: string;
  description: string;
  questions: AssessmentQuestion[];
}

export const ASSESSMENTS: AssessmentDefinition[] = [
  {
    id: 'python-functions-core',
    skill: 'Python',
    title: 'Python functions: output prediction & debugging',
    description: 'Five objectively graded questions on function calls, return values and scope.',
    questions: [
      {
        id: 'py1',
        type: 'code_output',
        prompt: 'What does this program print?',
        code: 'def f(x, y=2):\n    return x * y\n\nprint(f(3) + f(1, 4))',
        options: ['10', '7', '14', '6'],
        correctIndex: 0,
        explanation: 'f(3) = 6 and f(1, 4) = 4, so the sum is 10.',
      },
      {
        id: 'py2',
        type: 'code_output',
        prompt: 'What does this program print?',
        code: 'def show(n):\n    print(n * 2)\n\nresult = show(4)\nprint(result)',
        options: ['8 then 8', '8 then None', 'None then 8', '4 then 8'],
        correctIndex: 1,
        explanation: 'show prints 8 but returns None, so result is None.',
      },
      {
        id: 'py3',
        type: 'code_output',
        prompt: 'What is printed?',
        code: 'total = 5\n\ndef add():\n    total = 1\n    return total + 1\n\nadd()\nprint(total)',
        options: ['2', '6', '5', 'UnboundLocalError'],
        correctIndex: 2,
        explanation:
          'The assignment inside add creates a local variable; the global total is still 5.',
      },
      {
        id: 'py4',
        type: 'debugging',
        prompt: 'Which line contains the syntax error?',
        code: '1  def average(values)\n2      if not values:\n3          return None\n4      return sum(values) / len(values)',
        options: [
          'Line 1: missing colon after the parameter list',
          'Line 2: if needs parentheses',
          'Line 3: None must be lowercase',
          'Line 4: len cannot be used in a return',
        ],
        correctIndex: 0,
        explanation: 'A def line must end with a colon.',
      },
      {
        id: 'py5',
        type: 'code_output',
        prompt: 'What does this print?',
        code: 'def pair():\n    return 1, 2\n\na, b = pair()\nprint(b - a)',
        options: ['-1', '1', '(1, 2)', 'TypeError'],
        correctIndex: 1,
        explanation: 'pair returns a tuple that unpacks into a = 1 and b = 2.',
      },
    ],
  },
  {
    id: 'rest-api-basics',
    skill: 'REST APIs',
    title: 'Interpreting an API response',
    description: 'Three questions on reading HTTP status codes and JSON payloads.',
    questions: [
      {
        id: 'api1',
        type: 'multiple_choice',
        prompt:
          'A POST /students request returns status 201 with a Location header. What happened?',
        options: [
          'The request failed validation',
          'A new resource was created',
          'The client must authenticate',
          'Nothing changed on the server',
        ],
        correctIndex: 1,
        explanation: '201 Created means a new resource was created; Location points at it.',
      },
      {
        id: 'api2',
        type: 'multiple_choice',
        prompt: 'Given this response, how many students are on the current page?',
        code: '{\n  "page": 2,\n  "pageSize": 3,\n  "total": 7,\n  "items": [{"id": 4}, {"id": 5}, {"id": 6}]\n}',
        options: ['7', '2', '3', '6'],
        correctIndex: 2,
        explanation: 'items holds three objects on this page; total counts all pages.',
      },
      {
        id: 'api3',
        type: 'multiple_choice',
        prompt: 'A GET request returns 404 Not Found. What is the most likely cause?',
        options: [
          'The server crashed',
          'The requested resource does not exist at that URL',
          'The client sent invalid JSON',
          'The request was rate-limited',
        ],
        correctIndex: 1,
        explanation:
          '404 means the server could not find the resource; 5xx means server error, 429 rate limiting.',
      },
    ],
  },
  {
    id: 'sql-select-basics',
    skill: 'SQL',
    title: 'SQL SELECT basics',
    description: 'Three questions on SELECT, WHERE, ORDER BY and LIMIT.',
    questions: [
      {
        id: 'sql1',
        type: 'multiple_choice',
        prompt: 'Which clause keeps only rows that match a condition?',
        options: ['ORDER BY', 'WHERE', 'LIMIT', 'FROM'],
        correctIndex: 1,
        explanation: 'WHERE filters rows.',
      },
      {
        id: 'sql2',
        type: 'code_output',
        prompt: 'The table scores has values 70, 95, 88, 60. What does this query return?',
        code: 'SELECT score FROM scores\nORDER BY score DESC\nLIMIT 2;',
        options: ['70, 95', '95, 88', '60, 70', '88, 95'],
        correctIndex: 1,
        explanation: 'Descending order gives 95, 88, 70, 60; LIMIT 2 keeps the first two.',
      },
      {
        id: 'sql3',
        type: 'debugging',
        prompt: 'Why does this query fail?',
        code: 'SELECT name email FROM students;',
        options: [
          'FROM must come first',
          'Columns must be separated by a comma',
          'students must be quoted',
          'SELECT cannot return text',
        ],
        correctIndex: 1,
        explanation:
          'Without a comma, "email" is parsed as an alias of name (or an error in strict dialects).',
      },
    ],
  },
];

/** Deterministic grading: exact index comparison only. */
export function gradeAssessment(
  def: AssessmentDefinition,
  answers: Record<string, number | undefined>,
) {
  const results = def.questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    type: q.type,
    answer: answers[q.id] === undefined ? '' : (q.options[answers[q.id]!] ?? ''),
    correct: answers[q.id] === q.correctIndex,
  }));
  return {
    results,
    score: results.filter((r) => r.correct).length,
    maxScore: def.questions.length,
  };
}
