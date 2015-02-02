"use strict";

var _ = require('underscore');
var parse = require("esprima").parse;
var unparse = require("escodegen").generate;
var thunkify = require("../src/util2").thunkify;
var fail = require("../src/util2").fail;
var naming = require("../src/naming").naming;
var cps = require("../src/cps").cps;
var store = require("../src/store").store;
var optimize = require("../src/optimize").optimize;
var trampoline = require("../src/trampoline").trampoline;
var varargs = require("../src/varargs").varargs;

var fooObj = {
  bar: 1,
  baz: {
    blubb: 2,
    bla: 3
  }
};

var plus, minus, times, and, plusTwo;

function compose() {
    var fs = Array.prototype.concat.apply( [], arguments );

    return function( x ) {
	return fs.reduceRight( function( x, f ) {
	    return f( x );
	}, x );
    }
}

function runTest( test, code, expected, transformAst, run ) {
    var newCode = unparse( transformAst( parse( code ) ) );

    try {
	run( test, code, newCode, expected );
    }
    catch( e ) {
	console.log( "Exception:", e );
	console.log( newCode );
	test.ok( false );
	test.done();
    }
}

function check( test, code, newCode, expected, actual ) {
    var success = _.isEqual( expected, actual );

    test.ok( success );

    if( ! success ) {
	console.log( code );
	console.log( newCode );
	console.log( "Expected:", expected );
	console.log( "Actual:", actual );
    }

    test.done();
}

var transformAstNaming = compose( naming, function( node ) {
    return thunkify( node, fail( "transform", node ) );
});
function runNaming( test, code, newCode, expected ) {
    check( test, code, newCode, expected, eval( newCode )( "" ) );
}

var transformAstCps = compose( cps, transformAstNaming );
function runCps( test, code, newCode, expected ) {
    eval( newCode )( function( actual ) {
	check( test, code, newCode, expected, actual );
    }, "" );
}

var transformAstStorepassing = compose( store, transformAstCps );
function runStorepassing( test, code, newCode, expected ) {
    eval( newCode )( {}, function( store, actual ) {
	check( test, code, newCode, expected, actual );
    }, "" );
}

var transformAstOptimize = compose( optimize, transformAstStorepassing );
var runOptimize = runStorepassing;

var transformAstVarargs = compose( varargs, transformAstOptimize );
var runVarargs = runOptimize;

var transformAstTrampoline = compose( trampoline, transformAstVarargs );
var runTrampoline = runVarargs;

var selectNamingPrimitives = function(){
  // Set global definitions
  plus = function(a, x, y) {return (x + y);};
  minus = function(a, x, y) {return (x - y);};
  times = function(a, x, y) {return (x * y);};
  and = function(a, x, y) {return (x && y);};
  plusTwo = function(a, x, y) {return (x + 2);};
};

function selectCpsPrimitives(){
  // Set global definitions
  plus = function(k, a, x, y) {return k(x + y);};
  minus = function(k, a, x, y) {return k(x - y);};
  times = function(k, a, x, y) {return k(x * y);};
  and = function(k, a, x, y) {return k(x && y);};
  plusTwo = function(k, a, x, y) {return k(x + 2);};
};

function selectStorePrimitives(){
  // Set global definitions
  plus = function(s, k, x, y) {return k(s, x + y);};
  minus = function(s, k, x, y) {return k(s, x - y);};
  times = function(s, k, x, y) {return k(s, x * y);};
  and = function(s, k, x, y) {return k(s, x && y);};
  plusTwo = function(s, k, x, y) {return k(s, x + 2);};
}

var selectOptimizationPrimitives = selectStorePrimitives;
var selectVarargsPrimitives = selectOptimizationPrimitives;
var selectTrampolinePrimitives = selectVarargsPrimitives;

var generateTestFunctions = function(allTests, testRunner){
  var exports = {};
  for (var testClassName in allTests){
    var tests = allTests[testClassName];
    exports[testClassName] = {};
    tests.forEach(
      function(obj){
        exports[testClassName][obj.name] = function(test){
          if (!obj.runners || _.contains(obj.runners, testRunner)){
            return testRunner(test, obj.code, obj.expected);
          } else {
            test.done();
          }
        };
      });
  }
  return exports;
}


var tests = {

  testFunctionExpression:  [

    { name: 'testFunc1',
      code: 'var f = function(x){return plus(x, 10)}; f(3)',
      expected: 13 },

    { name: 'testRecursion',
      code: 'var f = function(x, n){return n==0 ? x : f(plusTwo(x), n-1);}; f(3, 4)',
      expected: 11 },

    { name: 'testDefinitionOnly1',
      code: 'var bar = function(){ var foo = function(){ return 3;} }; 5;',
      expected: 5 },

    { name: 'testDefinitionOnly2',
      code: 'var bar = function(){ var foo = function(){ return 3;}; var foo2 = function(){ return 4;} }; 5;',
      expected: 5 },

    { name: 'testReturn1',
      code: 'var foo = function(){ return 1; return 2; }; foo()',
      expected: 1 },

    { name: 'testReturn2',
      code: 'var foo = function(){ (function(){ return 1})(); return 2; }; foo()',
      expected: 2 }

  ],

  testCallExpressionTests : [

    { name: 'testPrimitive',
      code: 'plusTwo(3)',
      expected: 5 },

    { name: 'testCompound1',
      code: '(function(y){return plusTwo(y)})(123)',
      expected: 125 },

    { name: 'testCompound2',
      code: '(function(y){return y})(plusTwo(123))',
      expected: 125 },

    { name: 'testBinaryFuncPlus',
      code: 'plus(3, 5)',
      expected: 8 },

    { name: 'testBinaryFuncMinus',
      code: 'minus(3, 5)',
      expected: -2 },

    { name: 'testBinaryFuncAnd',
      code: 'and(true, false)',
      expected: false }

  ],

  testLiterals: [

    { name: 'testNumber',
      code: '456',
      expected: 456
    },

    { name: 'testString',
      code: "'foobar'",
      expected: 'foobar'
    },

    { name: 'testBool1',
      code: 'true',
      expected: true
    },

    { name: 'testBool2',
      code: 'false',
      expected: false
    }

  ],

  testEmptyStatement: [

    { name: 'testEmptyAlone',
      code: ";",
      expected: undefined },

    { name: 'testEmptyInBlock',
      code: "plusTwo(3); ; plusTwo(5);",
      expected: 7 }

  ],

  testBlockStatement: [

    { name: 'testProgram',
      code: "plusTwo(3); plusTwo(4); plusTwo(5);",
      expected: 7 },

    { name: 'testBlock1',
      code: "{ plusTwo(3) }; plusTwo(5);",
      expected: 7 },

    { name: 'testBlock2',
      code: "plusTwo(1); { plusTwo(3) }; plusTwo(5);",
      expected: 7 },

    { name: 'testBlock3',
      code: "plusTwo(1); { plusTwo(3); plusTwo(4); }; plusTwo(5);",
      expected: 7 },

    { name: 'testBlock4',
      code: "plusTwo(1); { plusTwo(3); plusTwo(4); }",
      expected: 6 },

    { name: 'testBlock5',
      code: ("var identity = function(x){return x};" +
             "var obj1 = identity({ 'X': 10, 'Y': 20 });" +
             "var foo = function(){ return baz(); };" +  // forward-recursive
             "var baz = function(){ return obj1['X']; };" +
             "foo();"),
      expected: 10,
      runners: [runOptimizationTest, runTrampolineTest] }

  ],

  testVariableDeclaration: [

    { name: 'testVar1',
      code: "var x = 1; x",
      expected: 1 },

    { name: 'testVar2',
      code: "var x = plus(1, 2); var y = times(x, 4); y",
      expected: 12 }

  ],

  testConditionalExpression: [

    { name: 'testConditional1',
      code: "false ? 1 : 2",
      expected: 2 },

    { name: 'testConditional2',
      code: "true ? 1 : 2",
      expected: 1 },

    { name: 'testConditional3',
      code: "and(true, false) ? 2 : 3",
      expected: 3 }

  ],

  testIfExpression: [

    { name: 'testIf1',
      code: "var foo = function(x){if (x > 2) { return 1 } else { return 2 }}; foo(3)",
      expected: 1 },

    { name: 'testIf2',
      code: "var foo = function(x){if (x > 2) { return 1 } else { return 2 }}; foo(1)",
      expected: 2 },

    { name: 'testIf3',
      code: "var foo = function(x){if (x > 2) { return 1 } else { return 2 }}; foo(foo(5))",
      expected: 2 },

    { name: 'testIfWithoutElse1',
      code: "var foo = function(x){if (x > 2) { return 1 }}; foo(5)",
      expected: 1 },

    { name: 'testIfWithoutElse2',
      code: "var foo = function(x){if (x > 2) { return 1 }}; foo(0)",
      expected: undefined },

    { name: 'testIfWithoutElse3',
      code: "var f = function(){ if (1 < 2) { var x = 1; var y = 2; return x + y;	}}; f();",
      expected: 3 },

    { name: 'testIfWithoutElse4',
      code: "var f = function(){ if (1 < 0) { return 1; }; return 5; }; f();",
      expected: 5 },

    { name: 'testNestedIf',
      code: "if (1 > 2) { 3 } else { if (4 < 5) { 6 } else { 7 }}",
      expected: 6 },

    { name: 'testIfWithReturn',
      code: "var foo = function(){ if (true) { return 3 } return 4 }; foo()",
      expected: 3 },

    { name: 'testIfInNestedFunction',
      code:  ("var foo = function(x){" +
              "  var bar = function(y){" +
              "    if (y == 10) {" +
              "      return 3;" +
              "    } else {" +
              "      return 4;" +
              "    }" +
              "  };" +
              "  var z = bar(x);" +
              "  if (z === 3){" +
              "    return 1;" +
              "  } else {" +
              "    return 2;" +
              "  };" +
              "};" +
              "foo(10);"),
      expected: 1 }

  ],

  testArrayExpressionTests: [

    { name: 'testArray1',
      code: "[1, 2, 3]",
      expected: [1, 2, 3] },

    { name: 'testArray2',
      code: "[plusTwo(1), plus(2, 5), 3]",
      expected: [3, 7, 3] }

  ],

  testMemberExpression: [

    { name: 'testMember1',
      code: "fooObj.bar",
      expected: 1 },

    { name: 'testMember2',
      code: "fooObj.baz.blubb",
      expected: 2 },

    { name: 'testMember3',
      code: "var a = [1,2]; a[1]",
      expected: 2 }

  ],

  testNAryExpressionTests: [

    { name: 'testPlus',
      code: "3 + 4",
      expected: 7 },

    { name: 'testUnary',
      code: "-5",
      expected: -5 },

    { name: 'testCompound1',
      code: "(-3 + (4 * 5)) - 10",
      expected: 7 },

    { name: 'testCompound2',
      code: "var f = function(x){return 2*x + 4;}; (-3 + f(4 * 5)) - f(10)",
      expected: 17 }

  ],

  testLogicalExpressionTest: [
    { name: 'testLogicalOr',
      code: "true || false",
      expected: true },
    { name: 'testLogicalNot',
      code: "!(true || true)",
      expected: false },
    { name: 'testLogicalAnd',
      code: "true && false",
      expected: false },
    { name: 'testLogicalCompound1',
      code: "true && (false || false || true)",
      expected: true },
    { name: 'testLogicalCompound2',
      code: "!(true && (false || false || true))",
      expected: false }
  ],

  testPrimitiveWrapping: [

    { name: 'testMath',
      code: "Math.log(Math.exp(5))",
      expected: 5 },

    { name: 'testCompound',
      code: "var f = function(x){return Math.log(x);}; Math.exp(f(17))",
      expected: 17 },

    { name: 'testMemberFromFn',
      code: "var foo = function() {return [1]}; foo().concat([2])",
      expected: [1,2] }

  ],

  testVarargs: [

    { name: 'testVarargs1',
      code: ("var foo = function(){return arguments[0] + arguments[1]};" +
             "foo(3, 4);"),
      expected: 7,
      runners: [runVarargsTest, runTrampolineTest] },

    { name: 'testVarargs2',
      code: ("var bar = function(){return arguments[0]*2};" +
             "var foo = function(){return bar(arguments[0] + arguments[1]);};" +
             "foo(3, 4);"),
      expected: 14,
      runners: [runVarargsTest, runTrampolineTest] },

    { name: 'testVarargs3',
      code: ("var foo = function(x, y){var f = function(){ return arguments[0]}; return f(y)};" +
             "foo(3, 4);"),
      expected: 4,
      runners: [runVarargsTest, runTrampolineTest] },

    // FIXME: This test currently fails because varargs happens after
    //        cps which introduces additional closures. To fix this,
    //        move the varargs transform up earlier in the order of
    //        transforms?
    // { name: 'testVarargs4',
    //   code: ("var bar = function(){return function(xs){return xs;}};;" +
    //          "var foo = function(){return bar()(arguments)};" +
    //          "foo(3, 4);"),
    //   expected: [3, 4],
    //   runners: [runVarargsTest, runTrampolineTest] },

    { name: 'testApply',
      code: ("var foo = function(x, y){return x + y};" +
             "var bar = function(){ return apply(foo, arguments); };" +
             "bar(3, 4);"),
      expected: 7,
      runners: [runVarargsTest, runTrampolineTest] }

  ]

};

exports.testNaming = generateTestFunctions(tests, runNamingTest);
exports.testCps = generateTestFunctions(tests, runCpsTest);
exports.testStorepassing = generateTestFunctions(tests, runStorepassingTest);
exports.testOptimization = generateTestFunctions(tests, runOptimizationTest);
exports.testVarargs = generateTestFunctions(tests, runVarargsTest);
exports.testTrampoline = generateTestFunctions(tests, runTrampolineTest);
