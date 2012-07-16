define(['vm/FieldDescriptor', 'vm/JavaArray', 'lib/JavaScriptStackTrace', 'vm/Primitives', 'vm/MethodRun', 'vm/Enum'],
  function(FieldDescriptor, JavaArray, printStackTrace, Primitives, MethodRun, Enum) {
    var Util = {};

    /* child must be a reference to this, and parentConstructor is the string that is the name of the contructor */
    Util.inherits = function(child, parentConstructor){
      //Initialize Parent
      var allArguments = Array.prototype.slice.call(Util.inherits.arguments);
      var constructorArguments = allArguments.slice(2); //Arguments to the parent's constructor
      //parentConstructor.arguments = constructorArguments;
      //var parent = new parentConstructor();
      var parent = {};
      parentConstructor.apply(parent, constructorArguments);

      //Go through all attributes of the parent and add them to the child
      for (var attribute in parent){
        //alert(attribute);
        /*if (parent[attribute] === undefined){
          alert("MOTHER OF GOD");
          alert(attribute +": " + parent[attribute]);
        }*/
        child[attribute] = parent[attribute];
      }
    };

    /**
     * Print a stack trace if an Util.assertion fails. Particularly useful to detect parsing errors when input doesn't appear sane.
     */
    Util.assert = function(assertion) {
      if (!assertion)
      {
        var stackTrace = printStackTrace();
        //We use this function in unit tests where JVM is not defined.
        if (typeof JVM !== 'undefined') {
          JVM.printError("Assertion Failed:\n" + stackTrace);
        }
        throw "Assertion Failed:\n" + stackTrace;
      }
    };

    /**
     * Wraps an unsigned int array in an object that can be used by Utf8Translator in Deflate.js.
     */
    Util.utf8Wrapper = function(bytes)
    {
      this.bytes = bytes;
      this.index = 0;
      this.readByte = function() {
        if (this.index >= this.bytes.length)
          return -1;
                
        var retVal = this.bytes[this.index];
        this.index++;
        return retVal;
      };
    };

    /**
     * Converts the JavaScript string into a Java string.
     */
    Util.getJavaString = function(string) {
      var charArray = new JavaArray(Enum.dataType.CHAR, null, 1, string.length);
      for (var i = 0; i < string.length; i++)
      {
        charArray.set(i, Primitives.getChar(string.charCodeAt(i)));
      }
      
      return MethodRun.constructObject("java/lang/String", "([C)V", charArray);
    };

    Util.parseMethodDescriptor = function(descriptorText) {
      Util.assert(descriptorText !== undefined);
      if(descriptorText.charAt(0) === '('){
        args = [];
        return Util.parseParameters(descriptorText.substr(1), args);

      }
    };

    /*Parsing Helper Functions*/
    Util.parseObjectDescriptor = function(text) {
      var semicolon = text.indexOf(';');
      if(semicolon !== -1){
        var result = text.substr(1, semicolon - 1); //Ignore the L
        return result;
      }
    };

    Util.parseArrayDescriptor = function(text, numOfDim) {
      if(text.charAt(0) === '['){
        numOfDim += 1;
        return Util.parseArrayDescriptor(text.substr(1), numOfDim);
      }else{
        var arrayType = Util.parseFieldDescriptor(text);
        return new FieldArrayDescriptor(FieldDescriptor.type.ARRAY, numOfDim, arrayType);
      }
    };

    Util.parseParameters = function(descriptorText, args) {
      if(descriptorText.charAt(0) === ')'){
        var field = Util.parseFieldDescriptor(descriptorText.substr(1));
        var method =  new MethodDescriptor(args,field);
        return method;
      }else{
        var descriptor = Util.parseFieldDescriptor(descriptorText);
        args.push(descriptor);
        return Util.parseParameters(descriptorText.substr(descriptor.length), args); //The last call should have changed the descriptorText
      }
    };

    Util.parseFieldDescriptor = function(descriptorText) {
      //Obejct Type
      if(descriptorText.charAt(0) === 'L'){
        return new FieldObjectDescriptor(FieldDescriptor.type.OBJECT, Util.parseObjectDescriptor(descriptorText));
      }
      //Array Type - Crazy Recursion
      else if(descriptorText.charAt(0) === '['){
        return Util.parseArrayDescriptor(descriptorText, 0);
      }
      //Base Type
      else{
        return new FieldBaseDescriptor(FieldDescriptor.type.BASE, descriptorText.charAt(0));
      }
    };

    function FieldObjectDescriptor(type, className) {
      var length = className.length + 2;
      Util.inherits(this, FieldDescriptor, type, length);
      this.className = className;
      
      this.toString = function(){
        return this.type + ", ClassName: " + this.className;
      };
    }

    function FieldArrayDescriptor(type, numberOfDimension, arrayType) { //Array type could be a FieldObjectDescriptor or a FieldBaseDescriptor!!
      var length = numberOfDimension + arrayType.length;
      Util.inherits(this, FieldDescriptor, type, length);
      this.numberOfDimension = numberOfDimension;
      this.arrayType = arrayType;
      
      this.toString = function(){
          return this.type + ", NumOfDim: " + this.numberOfDimension + ", Array Type:[" + arrayType + "]";
      };
    }

    function FieldBaseDescriptor(type, baseValue) {
      Util.inherits(this, FieldDescriptor, type, 1);
      this.baseValue = baseValue;
      
      this.toString = function(){
        return this.type + ", PrimitiveType: " + this.baseValue;
      };
    }

    function MethodDescriptor(args, returnType) {
      this.args = args;
      this.returnType = returnType;
      
      this.toString = function(){
        return "args: " + this.args.length + ", returnType: " + this.returnType;
      };
    }

    //TODO: This should not be here.
    Util.pushElement = function(text){
      if (JVM.isDebug()){
        var stack = document.getElementById("stack");
        stack.innerHTML += "<div class='stackElement' style='white-space:pre-wrap'>"+escapeHTML(text)+"</div>";
        Util.scrollToBottom("stackContainer");
      }
    };

    //TODO: This should not be here.
    Util.popElement = function(){
      //alert("Pop");
      if(JVM.isDebug()){
        var stack = document.getElementById("stack");
        var frames = stack.getElementsByTagName("div");
        if(frames.length > 0){
          Util.scrollToBottom("stackContainer");
          var lastFrame = frames[frames.length -1];
          stack.removeChild(lastFrame);
        }else{
          JVM.printError("No Frames To Pop");
        }
      }
    };

    /**
     * Scrolls the div with the given ID to the bottom.
     */
    Util.scrollToBottom = function(divId) {
      document.getElementById(divId).scrollTop = document.getElementById(divId).scrollHeight;
    };

    /**
     * Given a type and a value, ensure that the value
     * is appropriate for the type.
     *
     * Currently only used by unit testing. Does not work for
     * Long objects.
     */
    Util.typeValidation = function(type, value) {
      //Validation!
      switch(typeof value) {
        case "number":
          //Must be a numeric type
          Util.assert(type in StructDataTypes && type !== 'utf8');
          //Unsigned ints must be positive.
          if (type.charAt(0) === 'u') {
            Util.assert(value >= 0);
          }

          //Floating point numbers.
          if (value - Math.floor(value) !== 0) {
            Util.assert(type === 'float' || type === 'double');
          }

          break;
        case "string":
          Util.assert(type === 'utf8');
          break;
        case "object":
          Util.assert(value.type === type);
          break;
        //This should never be called with null or undefined or a boolean.
        case "null":
        case "undefined":
        case "boolean":
          throw "A null or undefined or boolean value is not acceptable.";
      }
    };

    /**
     * Verifies that the given name is a valid unqualified name (§4.2.1).
     * If isMethod is 'true', it performs extra methodname verification
     * specified in the JVM spec.
     *
     * Throws an exception if it is not.
     */
    Util.checkIsValidUnqualifiedName = function(name, isMethod) {
      var i, c, badCharacters = {'.':1, ';':1, '[':1, '/':1};

      Util.assert(name.length > 0);

      if (isMethod) {
        //Check if it's <init> or <clinit>
        if (name === '<init>' || name === '<clinit>') {
          return;
        }
        //Otherwise, forbid '<' and '>'.
        badCharacters['<'] = 1;
        badCharacters['>'] = 1;
      }

      for (i = 0; i < name.length; i++) {
        c = name.charAt(i);
        Util.assert(!(c in badCharacters));
      }
    };

    /**
     * Verifies that the given name is a valid class or interface
     * name (§4.2.1).
     *
     * Throws an exception if it is not.
     */
    Util.checkIsValidClassOrInterfaceName = function(name) {
      var substrs = name.split('/'), i;

      for (i = 0; i < substrs.length; i++) {
        Util.checkIsValidUnqualifiedName(substrs[i], false);
      }
    };

    return Util;
  }
);